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
    const { name, email, role, department, password } = req.body;

    if (req.user.role === 'manager' && ['super_admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Managers cannot create other managers or developers' });
    }

    const newUser = await User.create({
      name,
      email,
      role: role || 'student',
      department,
      password: password || 'DefaultPass123!'
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

    if (req.user.role === 'manager' && updates.role === 'developer') {
      return res.status(403).json({ error: 'Managers cannot escalate privileges to developer' });
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
    if (targetUser && targetUser.role === 'developer') {
      return res.status(403).json({ error: 'Cannot delete developer' });
    }

    await User.delete(id);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
};
