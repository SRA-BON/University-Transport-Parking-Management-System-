
const Parking = require('../models/Parking');
const User = require('../models/User');

exports.getDistricts = async (req, res) => {
  try {
    const districts = Parking.getDistricts();
    const vehicleTypes = Parking.getVehicleTypes();
    res.status(200).json({ districts, vehicleTypes });
  } catch (error) {
    console.error('Get districts error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getVehicles = async (req, res) => {
  try {
    const vehicles = await Parking.getVehicles(req.user.id);
    res.status(200).json({ vehicles });
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.addVehicle = async (req, res) => {
  try {
    const { district, vehicleType, regNumber, isDefault } = req.body;

    if (!district || !vehicleType || !regNumber) {
      return res.status(400).json({ error: 'District, vehicle type, and registration number are required' });
    }

    const vehicle = await Parking.addVehicle(req.user.id, {
      district,
      vehicleType,
      regNumber,
      isDefault: isDefault || false,
    });

    res.status(201).json({ message: 'Vehicle added successfully', vehicle });
  } catch (error) {
    console.error('Add vehicle error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const { district, vehicleType, regNumber, isDefault } = req.body;

    const vehicle = await Parking.updateVehicle(req.user.id, parseInt(id), {
      district,
      vehicleType,
      regNumber,
      isDefault,
    });

    res.status(200).json({ message: 'Vehicle updated successfully', vehicle });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    await Parking.deleteVehicle(req.user.id, parseInt(id));
    res.status(200).json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.setDefaultVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    await Parking.setDefaultVehicle(req.user.id, parseInt(id));
    res.status(200).json({ message: 'Default vehicle updated' });
  } catch (error) {
    console.error('Set default vehicle error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const vehicles = await Parking.getVehicles(req.user.id);
    const defaultVehicle = vehicles.find(v => v.is_default) || vehicles[0] || null;
    res.status(200).json({
      profile: defaultVehicle,
      vehicles,
    });
  } catch (error) {
    console.error('Get parking profile error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.createProfile = async (req, res) => {
  try {
    const { district, vehicleType, regNumber, vehicleRegNo } = req.body;

    if (district && vehicleType && regNumber) {
      const vehicle = await Parking.addVehicle(req.user.id, {
        district,
        vehicleType,
        regNumber,
        isDefault: true,
      });
      return res.status(201).json({ message: 'Vehicle added successfully', profile: vehicle, vehicle });
    }

    if (vehicleRegNo) {
      return res.status(400).json({ error: 'Please provide district, vehicleType, and regNumber separately' });
    }

    return res.status(400).json({ error: 'District, vehicle type, and registration number are required' });
  } catch (error) {
    console.error('Create parking profile error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.createEntry = async (req, res) => {
  try {
    const { rfidId, vehicleId } = req.body;
    let userId;
    let scannedRfid = rfidId;

    if (scannedRfid) {
      const user = await User.findByRFID(scannedRfid);
      if (!user) {
        return res.status(404).json({ error: `RFID not registered` });
      }
      if (user.is_active === false) {
          return res.status(403).json({ error: 'User account is deactivated' });
      }
      userId = user.id;
    } else {
      userId = req.user.id;
      scannedRfid = req.user.rfid_id;
    }

    const result = await Parking.createEntry(userId, vehicleId ? parseInt(vehicleId) : null);

    res.status(201).json({
      message: 'Parking entry recorded successfully',
      entry: {
        session_id: result.id,
        digital_token: result.digital_token,
        entry_time: result.entry_time,
        status: result.status,
        vehicle_id: result.vehicle_id,
      },
      student: {
        name: result.student.name,
        student_id: result.student.student_id,
        department: result.student.department,
        email: result.student.email,
        rfid_id: scannedRfid || result.student.rfid_id,
      },
      vehicle: {
        id: result.vehicle_id,
        registration_no: result.vehicle_reg_no,
      },
      parking_summary: result.parking_summary,
    });
  } catch (error) {
    console.error('Create parking entry error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.createExit = async (req, res) => {
  try {
    const { rfidId } = req.body;
    let userId;
    let scannedRfid = rfidId;

    if (scannedRfid) {
      const user = await User.findByRFID(scannedRfid);
      if (!user) {
        return res.status(404).json({ error: `RFID not registered` });
      }
      if (user.is_active === false) {
        return res.status(403).json({ error: 'User account is deactivated' });
      }
      userId = user.id;
    } else {
      userId = req.user.id;
      scannedRfid = req.user.rfid_id;
    }

    const result = await Parking.createExit(userId);

    res.status(200).json({
      message: 'Parking exit processed & bill paid successfully',
      session: {
        id: result.session.id,
        digital_token: result.digital_token,
        entry_time: result.session.entry_time,
        exit_time: result.session.exit_time,
        duration_minutes: result.session.duration_minutes,
        status: result.session.status,
      },
      student: {
        name: result.student.name,
        student_id: result.student.student_id,
        department: result.student.department,
        email: result.student.email,
        rfid_id: scannedRfid || result.student.rfid_id,
      },
      vehicle: {
        registration_no: result.vehicle_reg_no,
      },
      bill: result.bill,
      wallet: result.wallet,
      transaction: result.transaction,
      parking_summary: result.parking_summary,
    });
  } catch (error) {
    console.error('Create parking exit error:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const sessions = await Parking.getSessions(req.user.id);
    res.status(200).json({ sessions });
  } catch (error) {
    console.error('Get parking sessions error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getActiveSession = async (req, res) => {
  try {
    const session = await Parking.getActiveSession(req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'No active parking session' });
    }
    res.status(200).json({ session });
  } catch (error) {
    console.error('Get active parking session error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getParkingCapacity = async (req, res) => {
  try {
    const capacity = await Parking.getParkingCapacity();
    res.status(200).json({ capacity });
  } catch (error) {
    console.error('Get parking capacity error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateCapacity = async (req, res) => {
  try {
    if (!['developer', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { totalSpots } = req.body;
    if (!totalSpots || totalSpots <= 0) {
      return res.status(400).json({ error: 'Invalid total spots' });
    }

    const capacity = await Parking.updateCapacity(totalSpots);
    res.status(200).json({ message: 'Parking capacity updated', capacity });
  } catch (error) {
    console.error('Update parking capacity error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getParkingFeeRate = async (req, res) => {
  try {
    const rate = await Parking.getParkingFeeRate();
    res.status(200).json({ ratePerHour: rate });
  } catch (error) {
    console.error('Get parking fee rate error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateFeeRate = async (req, res) => {
  try {
    if (!['developer', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { ratePerHour } = req.body;
    if (!ratePerHour || ratePerHour < 0) {
      return res.status(400).json({ error: 'Invalid rate' });
    }

    const rate = await Parking.updateFeeRate(ratePerHour);
    res.status(200).json({ message: 'Parking fee rate updated', rate });
  } catch (error) {
    console.error('Update parking fee rate error:', error);
    res.status(500).json({ error: error.message });
  }
};
