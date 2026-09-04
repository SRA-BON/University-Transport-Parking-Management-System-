
const pool = require('../config/db');
const Wallet = require('./Wallet');

const BD_DISTRICTS = [
  'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Jamalpur', 'Kishoreganj',
  'Madaripur', 'Manikganj', 'Munshiganj', 'Mymensingh', 'Narayanganj', 'Narsingdi',
  'Netrokona', 'Rajbari', 'Shariatpur', 'Sherpur', 'Tangail', 'Bogra',
  'Joypurhat', 'Naogaon', 'Natore', 'Nawabganj', 'Pabna', 'Rajshahi',
  'Sirajganj', 'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari',
  'Panchagarh', 'Rangpur', 'Thakurgaon', 'Bagerhat', 'Chuadanga', 'Jashore',
  'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur', 'Narail',
  'Satkhira', 'Brahmanbaria', 'Chandpur', 'Chittagong', 'Comilla', "Cox's Bazar",
  'Feni', 'Khagrachari', 'Lakshmipur', 'Noakhali', 'Rangamati', 'Habiganj',
  'Maulvibazar', 'Sunamganj', 'Sylhet', 'Barisal', 'Bhola', 'Jhalokati',
  'Patuakhali', 'Pirojpur', 'Bandarban'
];

const VEHICLE_TYPES = ['La', 'Ha', 'Ga'];

class Parking {
  static getDistricts() {
    return BD_DISTRICTS;
  }

  static getVehicleTypes() {
    return VEHICLE_TYPES;
  }

  static async getParkingCapacity() {
    const result = await pool.query('SELECT * FROM parking_capacity ORDER BY id DESC LIMIT 1');
    if (result.rows.length === 0) {
      const initResult = await pool.query('INSERT INTO parking_capacity (car_total_spots, car_occupied_spots, bike_total_spots, bike_occupied_spots) VALUES (200, 0, 400, 0) RETURNING *');
      return initResult.rows[0];
    }
    return result.rows[0];
  }

  static async getParkingFeeRate() {
    const result = await pool.query('SELECT * FROM parking_fees ORDER BY id DESC LIMIT 1');
    if (result.rows.length === 0) {
      const initResult = await pool.query('INSERT INTO parking_fees (fixed_fee) VALUES (30.00) RETURNING *');
      return initResult.rows[0].fixed_fee;
    }
    return result.rows[0].fixed_fee;
  }

  static async getVehicles(userId) {
    const result = await pool.query(
      'SELECT * FROM vehicles WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC',
      [userId]
    );
    return result.rows;
  }

  static async getDefaultVehicle(userId) {
    const result = await pool.query(
      'SELECT * FROM vehicles WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
      [userId]
    );
    return result.rows[0] || null;
  }

  static async getVehicleById(vehicleId, userId) {
    const result = await pool.query(
      'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
      [vehicleId, userId]
    );
    return result.rows[0] || null;
  }

  static buildVehicleRegNo(district, vehicleType, regNumber) {
    return `${district}-${vehicleType} ${regNumber}`;
  }

  static validateDistrict(district) {
    return BD_DISTRICTS.includes(district);
  }

  static validateVehicleType(vehicleType) {
    return VEHICLE_TYPES.includes(vehicleType);
  }

  static validateRegNumber(regNumber) {
    return /^\d{2}-\d{4}$/.test(regNumber) || /^\d{6}$/.test(regNumber);
  }

  static async addVehicle(userId, { district, vehicleType, regNumber, isDefault = false }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (!this.validateDistrict(district)) {
        throw new Error('Invalid district selected');
      }
      if (!this.validateVehicleType(vehicleType)) {
        throw new Error('Invalid vehicle type. Must be La, Ha, or Ga');
      }
      if (!this.validateRegNumber(regNumber)) {
        throw new Error('Invalid registration number format. Use XX-XXXX (e.g., 54-2429)');
      }

      const vehicleRegNo = this.buildVehicleRegNo(district, vehicleType, regNumber);

      const dupCheck = await client.query(
        'SELECT id FROM vehicles WHERE vehicle_reg_no = $1',
        [vehicleRegNo]
      );
      if (dupCheck.rows.length > 0) {
        throw new Error('This vehicle registration number is already registered');
      }

      if (isDefault) {
        await client.query(
          'UPDATE vehicles SET is_default = FALSE WHERE user_id = $1',
          [userId]
        );
      }

      const result = await client.query(
        `INSERT INTO vehicles (user_id, district, vehicle_type, reg_number, vehicle_reg_no, is_default)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, district, vehicleType, regNumber, vehicleRegNo, isDefault]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async updateVehicle(userId, vehicleId, { district, vehicleType, regNumber, isDefault }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
        [vehicleId, userId]
      );
      if (existing.rows.length === 0) {
        throw new Error('Vehicle not found');
      }
      const vehicle = existing.rows[0];

      const newDistrict = district || vehicle.district;
      const newVehicleType = vehicleType || vehicle.vehicle_type;
      const newRegNumber = regNumber || vehicle.reg_number;
      const newIsDefault = isDefault !== undefined ? isDefault : vehicle.is_default;

      if (district && !this.validateDistrict(district)) {
        throw new Error('Invalid district selected');
      }
      if (vehicleType && !this.validateVehicleType(vehicleType)) {
        throw new Error('Invalid vehicle type. Must be La, Ha, or Ga');
      }
      if (regNumber && !this.validateRegNumber(regNumber)) {
        throw new Error('Invalid registration number format. Use XX-XXXX (e.g., 54-2429)');
      }

      const newVehicleRegNo = this.buildVehicleRegNo(newDistrict, newVehicleType, newRegNumber);

      if (newVehicleRegNo !== vehicle.vehicle_reg_no) {
        const dupCheck = await client.query(
          'SELECT id FROM vehicles WHERE vehicle_reg_no = $1 AND id != $2',
          [newVehicleRegNo, vehicleId]
        );
        if (dupCheck.rows.length > 0) {
          throw new Error('This vehicle registration number is already registered');
        }
      }

      if (newIsDefault) {
        await client.query(
          'UPDATE vehicles SET is_default = FALSE WHERE user_id = $1 AND id != $2',
          [userId, vehicleId]
        );
      }

      const result = await client.query(
        `UPDATE vehicles 
         SET district = $1, vehicle_type = $2, reg_number = $3, vehicle_reg_no = $4, is_default = $5, updated_at = NOW()
         WHERE id = $6 AND user_id = $7 RETURNING *`,
        [newDistrict, newVehicleType, newRegNumber, newVehicleRegNo, newIsDefault, vehicleId, userId]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async deleteVehicle(userId, vehicleId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
        [vehicleId, userId]
      );
      if (existing.rows.length === 0) {
        throw new Error('Vehicle not found');
      }
      const wasDefault = existing.rows[0].is_default;

      await client.query('DELETE FROM vehicles WHERE id = $1 AND user_id = $2', [vehicleId, userId]);

      if (wasDefault) {
        const next = await client.query(
          'SELECT id FROM vehicles WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
          [userId]
        );
        if (next.rows.length > 0) {
          await client.query(
            'UPDATE vehicles SET is_default = TRUE WHERE id = $1',
            [next.rows[0].id]
          );
        }
      }

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async setDefaultVehicle(userId, vehicleId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM vehicles WHERE id = $1 AND user_id = $2',
        [vehicleId, userId]
      );
      if (existing.rows.length === 0) {
        throw new Error('Vehicle not found');
      }

      await client.query(
        'UPDATE vehicles SET is_default = FALSE WHERE user_id = $1',
        [userId]
      );
      await client.query(
        'UPDATE vehicles SET is_default = TRUE WHERE id = $1 AND user_id = $2',
        [vehicleId, userId]
      );

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async getProfile(userId) {
    const vehicles = await this.getVehicles(userId);
    return vehicles.length > 0 ? vehicles[0] : null;
  }

  static async createEntry(userId, vehicleId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        'SELECT u.id, u.name, s.student_id, u.email, u.department, u.rfid_id, u.role FROM users u LEFT JOIN students s ON u.id = s.user_id WHERE u.id = $1',
        [userId]
      );
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }
      const user = userResult.rows[0];

      let vehicle;
      if (vehicleId) {
        const vResult = await client.query(
          'SELECT * FROM vehicles WHERE id = $1 AND user_id = $2',
          [vehicleId, userId]
        );
        vehicle = vResult.rows[0];
        if (!vehicle) {
          throw new Error('Vehicle not found for this user');
        }
      } else {
        const vResult = await client.query(
          'SELECT * FROM vehicles WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
          [userId]
        );
        vehicle = vResult.rows[0];
      }

      if (!vehicle) {
        const anyVehicle = await client.query(
          'SELECT * FROM vehicles WHERE user_id = $1 LIMIT 1',
          [userId]
        );
        vehicle = anyVehicle.rows[0];
      }

      if (!vehicle) {
        throw new Error('Please register at least one vehicle before entering parking');
      }

      const activeSessionResult = await client.query(
        'SELECT id FROM parking_sessions WHERE user_id = $1 AND status = $2 LIMIT 1 FOR UPDATE',
        [userId, 'active']
      );
      if (activeSessionResult.rows.length > 0) {
        throw new Error('You already have an active parking session');
      }

      const capacityResult = await client.query('SELECT * FROM parking_capacity ORDER BY id DESC LIMIT 1 FOR UPDATE');
      let capacity = capacityResult.rows[0];

      if (!capacity) {
        const initCap = await client.query(
          'INSERT INTO parking_capacity (car_total_spots, car_occupied_spots, bike_total_spots, bike_occupied_spots) VALUES (200, 0, 400, 0) RETURNING *'
        );
        capacity = initCap.rows[0];
      }

      const isCar = vehicle.vehicle_type === 'Ga';

      if (isCar) {
        if (capacity.car_occupied_spots >= capacity.car_total_spots) throw new Error('Car parking is full');
      } else {
        if (capacity.bike_occupied_spots >= capacity.bike_total_spots) throw new Error('Bike parking is full');
      }
      const capRow = capacity;

      let token;
      let attempts = 0;
      while (attempts < 50) {
        token = Math.floor(100 + Math.random() * 900).toString();
        const tokenCheck = await client.query('SELECT id FROM parking_sessions WHERE digital_token = $1 AND status = $2', [token, 'active']);
        if (tokenCheck.rows.length === 0) break;
        attempts++;
        if (attempts >= 50) throw new Error('Unable to generate unique digital token. Parking may be at capacity.');
      }

      const sessionResult = await client.query(
        `INSERT INTO parking_sessions (user_id, vehicle_id, vehicle_reg_no, digital_token, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, vehicle.id, vehicle.vehicle_reg_no, token, 'active']
      );
      const session = sessionResult.rows[0];

      if (isCar) {
        await client.query(
          'UPDATE parking_capacity SET car_occupied_spots = car_occupied_spots + 1, updated_at = NOW() WHERE id = $1',
          [capRow.id]
        );
      } else {
        await client.query(
          'UPDATE parking_capacity SET bike_occupied_spots = bike_occupied_spots + 1, updated_at = NOW() WHERE id = $1',
          [capRow.id]
        );
      }

      const updatedCap = await client.query('SELECT * FROM parking_capacity WHERE id = $1', [capRow.id]);

      await client.query('COMMIT');
      return {
        ...session,
        student: {
          id: user.id,
          name: user.name,
          student_id: user.student_id,
          department: user.department,
          email: user.email,
          rfid_id: user.rfid_id,
        },
        vehicle_reg_no: vehicle.vehicle_reg_no,
        vehicle_id: vehicle.id,
        parking_summary: {
          car_total_spots: updatedCap.rows[0].car_total_spots,
          car_occupied_spots: updatedCap.rows[0].car_occupied_spots,
          car_available_spots: updatedCap.rows[0].car_total_spots - updatedCap.rows[0].car_occupied_spots,
          bike_total_spots: updatedCap.rows[0].bike_total_spots,
          bike_occupied_spots: updatedCap.rows[0].bike_occupied_spots,
          bike_available_spots: updatedCap.rows[0].bike_total_spots - updatedCap.rows[0].bike_occupied_spots,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async createExit(userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        'SELECT u.id, u.name, s.student_id, u.email, u.department, u.rfid_id, u.role FROM users u LEFT JOIN students s ON u.id = s.user_id WHERE u.id = $1',
        [userId]
      );
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }
      const user = userResult.rows[0];

      const sessionResult = await client.query(
        'SELECT * FROM parking_sessions WHERE user_id = $1 AND status = $2 ORDER BY entry_time DESC LIMIT 1 FOR UPDATE',
        [userId, 'active']
      );
      if (sessionResult.rows.length === 0) {
        throw new Error('No active parking session found for this user');
      }
      const session = sessionResult.rows[0];
      const isCar = session.vehicle_reg_no.includes('-Ga ');

      const entryTime = new Date(session.entry_time);
      const exitTime = new Date();
      const durationMs = exitTime.getTime() - entryTime.getTime();
      const durationMinutes = Math.max(1, Math.ceil(durationMs / (1000 * 60)));
      const hoursRounded = Math.ceil(durationMinutes / 60);

      const rateRow = await client.query('SELECT fixed_fee FROM parking_fees ORDER BY id DESC LIMIT 1');
      let fee = 30.00;
      if (rateRow.rows.length > 0 && rateRow.rows[0].fixed_fee) {
        fee = Number(rateRow.rows[0].fixed_fee);
      }

      const walletBefore = await client.query('SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
      if (walletBefore.rows.length === 0) {
        throw new Error('No wallet found for this user. Please recharge wallet before exiting.');
      }
      const wallet = walletBefore.rows[0];
      const balanceBefore = Number(wallet.balance);
      const balanceAfter = Number((balanceBefore - fee).toFixed(2));
      if (balanceAfter < 0) {
        throw new Error(`Insufficient wallet balance. Parking fee: ${fee} ৳, available: ${balanceBefore} ৳. Please recharge.`);
      }
      await client.query('UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2', [balanceAfter, wallet.id]);
      const txResult = await client.query(
        `INSERT INTO transactions (wallet_id, amount, type, description)
         VALUES ($1, $2, 'payment', $3) RETURNING *`,
        [wallet.id, -fee, `Parking exit fee - session #${session.id} (${durationMinutes} min)`]
      );
      const transaction = txResult.rows[0];

      await client.query(
        `UPDATE parking_sessions SET exit_time = $1, duration_minutes = $2, fee = $3, status = $4, updated_at = NOW() WHERE id = $5`,
        [exitTime, durationMinutes, fee, 'completed', session.id]
      );

      const capacityResult = await client.query('SELECT * FROM parking_capacity ORDER BY id DESC LIMIT 1');
      let capFinal = { car_total_spots: 200, car_occupied_spots: 0, bike_total_spots: 400, bike_occupied_spots: 0 };
      if (capacityResult.rows.length > 0) {
        if (isCar) {
          await client.query(
            'UPDATE parking_capacity SET car_occupied_spots = GREATEST(0, car_occupied_spots - 1), updated_at = NOW() WHERE id = $1',
            [capacityResult.rows[0].id]
          );
          capFinal = { ...capacityResult.rows[0], car_occupied_spots: Math.max(0, capacityResult.rows[0].car_occupied_spots - 1) };
        } else {
          await client.query(
            'UPDATE parking_capacity SET bike_occupied_spots = GREATEST(0, bike_occupied_spots - 1), updated_at = NOW() WHERE id = $1',
            [capacityResult.rows[0].id]
          );
          capFinal = { ...capacityResult.rows[0], bike_occupied_spots: Math.max(0, capacityResult.rows[0].bike_occupied_spots - 1) };
        }
      }

      await client.query('COMMIT');

      return {
        session: {
          ...session,
          exit_time: exitTime,
          duration_minutes: durationMinutes,
          fee,
          status: 'completed',
        },
        student: {
          id: user.id,
          name: user.name,
          student_id: user.student_id,
          department: user.department,
          email: user.email,
          rfid_id: user.rfid_id,
        },
        vehicle_reg_no: session.vehicle_reg_no,
        digital_token: session.digital_token,
        bill: {
          fixed_fee: fee,
          duration_minutes: durationMinutes,
          billed_hours: hoursRounded,
          total_fee: fee,
          currency: 'BDT',
        },
        wallet: {
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          deducted: fee,
        },
        transaction: {
          id: transaction.id,
          type: transaction.type,
          description: transaction.description,
          timestamp: transaction.created_at,
        },
        parking_summary: {
          car_total_spots: capFinal.car_total_spots,
          car_occupied_spots: capFinal.car_occupied_spots,
          car_available_spots: capFinal.car_total_spots - capFinal.car_occupied_spots,
          bike_total_spots: capFinal.bike_total_spots,
          bike_occupied_spots: capFinal.bike_occupied_spots,
          bike_available_spots: capFinal.bike_total_spots - capFinal.bike_occupied_spots,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async getSessions(userId) {
    const result = await pool.query(
      'SELECT * FROM parking_sessions WHERE user_id = $1 ORDER BY entry_time DESC',
      [userId]
    );
    return result.rows.map(r => ({
      ...r,
      fee: r.fee != null ? Number(r.fee) : null,
      duration_minutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
    }));
  }

  static async getAllActiveSessions() {
    const result = await pool.query(
      `SELECT ps.id, ps.user_id, ps.vehicle_reg_no, ps.digital_token,
              ps.entry_time, ps.status,
              u.name AS student_name, s.student_id, u.department, u.rfid_id,
              EXTRACT(EPOCH FROM (NOW() - ps.entry_time))/60 AS duration_minutes_so_far
       FROM parking_sessions ps
       JOIN users u ON u.id = ps.user_id
       LEFT JOIN students s ON u.id = s.user_id
       WHERE ps.status = 'active'
       ORDER BY ps.entry_time DESC`
    );
    return result.rows.map(r => ({
      ...r,
      duration_minutes_so_far: r.duration_minutes_so_far != null ? Number(r.duration_minutes_so_far) : null,
    }));
  }

  static async getActiveSession(userId) {
    const result = await pool.query(
      'SELECT * FROM parking_sessions WHERE user_id = $1 AND status = $2 ORDER BY entry_time DESC LIMIT 1',
      [userId, 'active']
    );
    const r = result.rows[0];
    if (!r) return r;
    return {
      ...r,
      fee: r.fee != null ? Number(r.fee) : null,
      duration_minutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
    };
  }

  static async updateCapacity(totalSpots) {
    const result = await pool.query(
      'UPDATE parking_capacity SET total_spots = $1 WHERE id = (SELECT id FROM parking_capacity ORDER BY id DESC LIMIT 1) RETURNING *',
      [totalSpots]
    );
    return result.rows[0];
  }

  static async updateFeeRate(ratePerHour) {
    const result = await pool.query(
      'UPDATE parking_fees SET rate_per_hour = $1 WHERE id = (SELECT id FROM parking_fees ORDER BY id DESC LIMIT 1) RETURNING *',
      [ratePerHour]
    );
    return result.rows[0];
  }
}

module.exports = Parking;
