const User = require('../models/User');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.getAll();
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, role, department, password, studentId, student_id } = req.body;

    if (req.user.role === 'manager' && ['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Managers cannot create other managers or admins' });
    }

    if (role === 'admin') {
      const UserModel = require('../models/User');
      const allUsers = await UserModel.getAll();
      if (allUsers.some(u => u.role === 'admin')) {
        return res.status(400).json({ error: 'System supports only one admin account' });
      }
    }

    const finalRole = role || 'student';
    if (finalRole === 'student' && (studentId || student_id)) {
      const clean = String(studentId || student_id).trim();
      if (!/^(22|23)\d{6}$/.test(clean)) {
        return res.status(400).json({ error: 'Student ID must be 8 digits starting with 22 or 23 (e.g. 22201297)' });
      }
    }

    const newUser = await User.create({
      name,
      email,
      role: finalRole,
      department,
      password: password || 'DefaultPass123!',
      studentId: studentId || student_id, // User.create routes this to the correct subtype table
    });

    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (req.user.role === 'manager' && updates.role === 'admin') {
      return res.status(403).json({ error: 'Managers cannot escalate privileges to admin' });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deactivating admin or super_admin accounts
    if (updates.is_active === false || updates.is_active === 'false') {
      if (['admin', 'super_admin'].includes(targetUser.role)) {
        return res.status(403).json({ error: 'Cannot deactivate an admin or super_admin account.' });
      }
    }

    const updatedUser = await User.update(id, updates);
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const targetUser = await User.findById(id);
    if (targetUser && targetUser.role === 'admin') {
      return res.status(403).json({ error: 'Cannot delete admin' });
    }

    await User.delete(id);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
};
