
const User = require('../models/User');
const Parking = require('../models/Parking');

class RFIDController {
  /**
   * Verify user identity by RFID card
   * Used for both transport boarding and parking entry/exit
   */
  static async verify(req, res) {
    try {
      const { rfid_id } = req.body;

      if (!rfid_id) {
        return res.status(400).json({ error: 'RFID ID is required' });
      }

      console.log(`🔍 Verifying RFID: ${rfid_id}`);

      const user = await User.findByRFID(rfid_id);

      if (!user) {
        console.log(`❌ RFID ${rfid_id} not found`);
        return res.status(404).json({ error: 'RFID card not registered' });
      }

      if (user.is_active === false) {
        console.log(`❌ User ${user.id} is deactivated`);
        return res.status(403).json({ error: 'User account is deactivated' });
      }

      console.log(`✅ RFID verified for user: ${user.name} (${user.student_id})`);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          student_id: user.student_id,
          email: user.email,
          department: user.department,
          role: user.role,
          no_show_count: user.no_show_count,
          rfid_id: user.rfid_id,
        }
      });
    } catch (error) {
      console.error('❌ RFID Verification Error:', error);
      res.status(500).json({ error: 'Failed to verify RFID', details: error.message });
    }
  }

  /**
   * Quick lookup of a user by RFID — used by the global RFID status bar in the frontend.
   * Returns basic user info without triggering any parking/booking action.
   * Accepts rfid_id as a query param: GET /rfid/lookup?rfid_id=xxxxx
   */
  static async lookup(req, res) {
    try {
      const rfid_id = req.query.rfid_id || req.body.rfid_id;
      if (!rfid_id) return res.status(400).json({ error: 'rfid_id is required' });

      const user = await User.findByRFID(rfid_id);
      if (!user) return res.status(404).json({ error: 'RFID card not registered' });

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          student_id: user.student_id,
          display_id: user.display_id,
          email: user.email,
          department: user.department,
          role: user.role,
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Lookup failed', details: error.message });
    }
  }

  /**
   * AUTOMATED PARKING ENTRY — triggered directly by the RFID scanner at the gate.
   * Looks up user by RFID → creates parking session → returns
   * student name/ID/dept + entry time + 3-digit digital token.
   */
  static async parkingEntry(req, res) {
    try {
      const { rfid_id } = req.body;

      if (!rfid_id) {
        return res.status(400).json({ error: 'RFID ID is required for parking entry' });
      }

      console.log(`[Parking] ENTRY scan — RFID: ${rfid_id}`);

      const user = await User.findByRFID(rfid_id);
      if (!user) {
        console.log(`[Parking] Entry failed — RFID ${rfid_id} not registered`);
        return res.status(404).json({ error: 'RFID card not registered to any student' });
      }
      if (user.is_active === false) {
        return res.status(403).json({ error: 'User account is deactivated' });
      }

      let result;
      try {
        result = await Parking.createEntry(user.id);
      } catch (parkingErr) {
        console.error(`[Parking] Entry logic failed for ${user.email}: ${parkingErr.message}`);
        return res.status(400).json({
          error: parkingErr.message,
          student: {
            name: user.name,
            student_id: user.student_id,
            department: user.department,
          }
        });
      }

      console.log(`✅ Parking ENTRY recorded for ${user.name} (${user.student_id}) — token ${result.digital_token}`);

      res.status(201).json({
        success: true,
        event: 'parking_entry',
        message: 'Parking entry recorded. Digital token assigned.',
        entry: {
          session_id: result.id,
          digital_token: result.digital_token,
          entry_time: result.entry_time,
          status: result.status,
        },
        student: {
          name: result.student.name,
          student_id: result.student.student_id,
          department: result.student.department,
          email: result.student.email,
          rfid_id: rfid_id,
        },
        vehicle: {
          registration_no: result.vehicle_reg_no,
        },
        parking_summary: result.parking_summary,
      });
    } catch (error) {
      console.error('[RFID] Parking Entry Error:', error);
      res.status(500).json({ error: 'Failed to process parking entry', details: error.message });
    }
  }

  /**
   * AUTOMATED PARKING EXIT + BILLING — triggered directly by the RFID scanner at exit.
   * Looks up user by RFID → closes session → calculates duration + bill →
   * deducts from wallet → returns receipt + new balance.
   */
  static async parkingExit(req, res) {
    try {
      const { rfid_id } = req.body;

      if (!rfid_id) {
        return res.status(400).json({ error: 'RFID ID is required for parking exit' });
      }

      console.log(`[Parking] EXIT scan — RFID: ${rfid_id}`);

      const user = await User.findByRFID(rfid_id);
      if (!user) {
        console.log(`[Parking] Exit failed — RFID ${rfid_id} not registered`);
        return res.status(404).json({ error: 'RFID card not registered to any student' });
      }
      if (user.is_active === false) {
        return res.status(403).json({ error: 'User account is deactivated' });
      }

      let result;
      try {
        result = await Parking.createExit(user.id);
      } catch (parkingErr) {
        console.error(`[Parking] Exit logic failed for ${user.email}: ${parkingErr.message}`);
        return res.status(400).json({
          error: parkingErr.message,
          student: {
            name: user.name,
            student_id: user.student_id,
            department: user.department,
          }
        });
      }

      console.log(
        `[Parking] EXIT completed for ${user.name} (${user.student_id}) — ` +
        `fee ${result.bill.total_fee}৳, wallet ${result.wallet.balance_before} → ${result.wallet.balance_after}`
      );

      res.status(200).json({
        success: true,
        event: 'parking_exit',
        message: 'Parking exit processed. Bill automatically deducted from wallet.',
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
          rfid_id: rfid_id,
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
      console.error('[RFID] Parking Exit Error:', error);
      res.status(500).json({ error: 'Failed to process parking exit & billing', details: error.message });
    }
  }

  /**
   * AUTOMATED PARKING SCAN (AUTO-DETECT ENTRY vs EXIT) — triggered by any RFID scanner.
   * If the user has an ACTIVE parking session → treats as EXIT (bills wallet).
   * If no active session → treats as ENTRY (creates session + assigns token).
   */
  static async parkingScan(req, res) {
    try {
      const { rfid_id } = req.body;

      if (!rfid_id) {
        return res.status(400).json({ error: 'RFID ID is required for parking scan' });
      }

      console.log(`🅿️  Parking AUTO-SCAN — RFID: ${rfid_id}`);

      const user = await User.findByRFID(rfid_id);
      if (!user) {
        console.log(`❌ Parking scan failed — RFID ${rfid_id} not registered`);
        return res.status(404).json({ error: 'RFID card not registered to any student' });
      }
      if (user.is_active === false) {
        return res.status(403).json({ error: 'User account is deactivated' });
      }

      const active = await Parking.getActiveSession(user.id);
      const action = active ? 'exit' : 'entry';
      console.log(`   → Detected action: ${action.toUpperCase()} (active session: ${!!active})`);

      let result;
      try {
        if (action === 'entry') {
          result = await Parking.createEntry(user.id);
        } else {
          result = await Parking.createExit(user.id);
        }
      } catch (parkingErr) {
        console.error(`❌ Parking ${action} logic failed for ${user.email}: ${parkingErr.message}`);
        return res.status(400).json({
          error: parkingErr.message,
          student: {
            name: user.name,
            student_id: user.student_id,
            department: user.department,
          }
        });
      }

      if (action === 'entry') {
        console.log(`[Parking] ENTRY recorded for ${user.name} (${user.student_id}) — token ${result.digital_token}`);
        return res.status(201).json({
          success: true,
          action: 'entry',
          event: 'parking_entry',
          message: 'Parking entry recorded. Digital token assigned.',
          entry: {
            session_id: result.id,
            digital_token: result.digital_token,
            entry_time: result.entry_time,
            status: result.status,
          },
          student: {
            name: result.student.name,
            student_id: result.student.student_id,
            department: result.student.department,
            email: result.student.email,
            rfid_id: rfid_id,
          },
          vehicle: {
            registration_no: result.vehicle_reg_no,
          },
          parking_summary: result.parking_summary,
        });
      }

      console.log(
        `[Parking] EXIT completed for ${user.name} (${user.student_id}) — ` +
        `fee ${result.bill.total_fee}৳, wallet ${result.wallet.balance_before} → ${result.wallet.balance_after}`
      );
      return res.status(200).json({
        success: true,
        action: 'exit',
        event: 'parking_exit',
        message: 'Parking exit processed. Bill automatically deducted from wallet.',
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
          rfid_id: rfid_id,
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
      console.error('[RFID] Parking Auto-Scan Error:', error);
      res.status(500).json({ error: 'Failed to process parking scan', details: error.message });
    }
  }

  /**
   * Register RFID card to a user
   */
  static async register(req, res) {
    try {
      const { user_id, rfid_id } = req.body;

      if (!user_id || !rfid_id) {
        return res.status(400).json({ error: 'User ID and RFID ID are required' });
      }

      const existingUser = await User.findByRFID(rfid_id);
      if (existingUser) {
        return res.status(400).json({ error: 'RFID card already registered to another user' });
      }

      const user = await User.updateRFID(user_id, rfid_id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      console.log(`✅ RFID ${rfid_id} registered to user ${user_id}`);

      res.status(200).json({
        success: true,
        message: 'RFID card registered successfully',
        user: {
          id: user.id,
          name: user.name,
          student_id: user.student_id,
          rfid_id: user.rfid_id
        }
      });
    } catch (error) {
      console.error('❌ RFID Registration Error:', error);
      res.status(500).json({ error: 'Failed to register RFID', details: error.message });
    }
  }

  /**
   * Unregister RFID card from a user
   */
  static async unregister(req, res) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const user = await User.updateRFID(user_id, null);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      console.log(`✅ RFID unregistered from user ${user_id}`);

      res.status(200).json({
        success: true,
        message: 'RFID card unregistered successfully'
      });
    } catch (error) {
      console.error('❌ RFID Unregistration Error:', error);
      res.status(500).json({ error: 'Failed to unregister RFID', details: error.message });
    }
  }
}

module.exports = RFIDController;
