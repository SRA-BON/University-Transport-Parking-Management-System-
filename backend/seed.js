
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Route Data
const routes = [
  // Inbound Routes
  { name: 'Abdullahpur-A to BRAC University', direction: 'inbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Abdullahpur-B to BRAC University', direction: 'inbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Mirpur-A to BRAC University', direction: 'inbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Mirpur-B to BRAC University', direction: 'inbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Baldha Garden to BRAC University', direction: 'inbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Mohammadpur-A to BRAC University', direction: 'inbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Mohammadpur-B to BRAC University', direction: 'inbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Narayanganj to BRAC University', direction: 'inbound', classification: 'narayanganj', single_trip_fare: 160, round_trip_fare: 320 },
  { name: 'Bashundhara Residential Area to BRAC University', direction: 'inbound', classification: 'bashundhara', single_trip_fare: 50, round_trip_fare: 100 },
  // Outbound Routes
  { name: 'Route-01 BRAC University to Abdullahpur-A', direction: 'outbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Route-01 BRAC University to Abdullahpur-B', direction: 'outbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Route-02 BRAC University to Mirpur-A', direction: 'outbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Route-02 BRAC University to Mirpur-B', direction: 'outbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Route-05 BRAC University to Baldha Garden', direction: 'outbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Route-06 BRAC University to Mohammadpur-A', direction: 'outbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Route-06 BRAC University to Mohammadpur-B', direction: 'outbound', classification: 'standard', single_trip_fare: 110, round_trip_fare: 220 },
  { name: 'Route-07 BRAC University to Narayanganj', direction: 'outbound', classification: 'narayanganj', single_trip_fare: 160, round_trip_fare: 320 },
  { name: 'Route-08 BRAC University to Bashundhara Residential Area', direction: 'outbound', classification: 'bashundhara', single_trip_fare: 50, round_trip_fare: 100 },
];

const buses = [
  { bus_number: 'BU-001', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-002', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-003', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-004', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-005', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-006', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-007', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-008', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-009', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-010', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-011', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-012', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-013', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-014', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-015', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-016', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-017', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-018', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-019', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-020', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-021', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-022', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-023', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-024', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-025', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-026', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-027', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-028', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-029', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-030', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-031', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-032', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-033', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-034', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-035', capacity: 40, standby_capacity: 10 },
  { bus_number: 'BU-036', capacity: 40, standby_capacity: 10 },
];

const users = [
  {
    name: 'Developer User',
    email: 'developer@bracu.ac.bd',
    password: 'developer123',
    student_id: 'DEV-001',
    role: 'developer',
    rfid_id: 'RFID-DEV-001',
    department: 'System Development'
  },
  {
    name: 'Manager User',
    email: 'manager@bracu.ac.bd',
    password: 'manager123',
    student_id: 'MNG-001',
    role: 'manager',
    rfid_id: 'RFID-MNG-001',
    department: 'Transport Management'
  },
  {
    name: 'Test Student',
    email: 'student@bracu.ac.bd',
    password: 'student123',
    student_id: 'STU-2024-001',
    role: 'student',
    rfid_id: 'RFID-STU-001',
    department: 'CSE'
  }
];

async function seed() {
  console.log('🚀 Starting BRAC University Transport System Seeding...');
  
  try {
    await pool.query('BEGIN');

    await pool.query('DELETE FROM trips');
    await pool.query('DELETE FROM routes');
    await pool.query('DELETE FROM buses');
    await pool.query('DELETE FROM transactions');
    await pool.query('DELETE FROM wallets');
    await pool.query('DELETE FROM check_ins');
    await pool.query('DELETE FROM bookings');
    await pool.query('DELETE FROM users');

    // Seed Routes
    console.log('📋 Seeding routes...');
    for (const route of routes) {
      await pool.query(
        'INSERT INTO routes (name, direction, classification, single_trip_fare, round_trip_fare) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [route.name, route.direction, route.classification, route.single_trip_fare, route.round_trip_fare]
      );
    }
    console.log('✅ Routes added');

    // Seed Buses
    console.log('🚌 Seeding buses...');
    for (const bus of buses) {
      await pool.query(
        'INSERT INTO buses (bus_number, capacity, standby_capacity) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [bus.bus_number, bus.capacity, bus.standby_capacity]
      );
    }
    console.log('✅ Buses added');

    // Seed Users and Wallets
    console.log('👤 Seeding users and wallets...');
    for (const user of users) {
      const hashedPassword = await hashPassword(user.password);
      const userResult = await pool.query(
        'INSERT INTO users (name, email, password_hash, student_id, role, rfid_id, department) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [user.name, user.email, hashedPassword, user.student_id, user.role, user.rfid_id, user.department]
      );
      const userId = userResult.rows[0].id;
      
      await pool.query(
        'INSERT INTO wallets (user_id, balance) VALUES ($1, $2)',
        [userId, 500.00] // Starting balance for admin/management
      );
    }
    console.log('✅ Users and wallets added');

    // Get all routes and buses
    const allRoutesResult = await pool.query('SELECT id, name, direction, classification FROM routes');
    const allBusesResult = await pool.query('SELECT id, bus_number, capacity, standby_capacity FROM buses');
    const allRoutes = allRoutesResult.rows;
    const allBuses = allBusesResult.rows;
    const allRoutesMap = allRoutes.reduce((acc, r) => ({ ...acc, [r.name]: r }), {});
    const allBusesMap = allBuses.reduce((acc, b) => ({ ...acc, [b.bus_number]: b }), {});
    const allRoutesDirMap = allRoutes.reduce((acc, r) => {
      if (!acc[r.direction]) acc[r.direction] = [];
      acc[r.direction].push(r);
      return acc;
    }, {});

    // Seed Trips
    console.log('🚍 Seeding trips...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1); // Tomorrow's date
    let busIndex = 0;
    let tripsCount = 0;

    // Inbound trips (6:00 and 14:00 tomorrow)
    const inboundRoutes = allRoutesDirMap.inbound || [];
    for (const route of inboundRoutes) {
      const depTimes = ['06:00', '14:00'];
      for (const depTime of depTimes) {
        const [hours, minutes] = depTime.split(':');
        const departureTime = new Date(tomorrow);
        departureTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const arrivalTime = new Date(departureTime);
        arrivalTime.setHours(arrivalTime.getHours() + 1);

        const bus = allBuses[busIndex % allBuses.length];
        await pool.query(
          `INSERT INTO trips (bus_id, route_id, departure_time, arrival_time, available_seats, available_standby, status) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [bus.id, route.id, departureTime, arrivalTime, bus.capacity, bus.standby_capacity, 'scheduled']
        );
        busIndex++;
        tripsCount++;
      }
    }

    // Outbound trips (14:00 and 17:00 tomorrow)
    const outboundRoutes = allRoutesDirMap.outbound || [];
    for (const route of outboundRoutes) {
      const depTimes = ['14:00', '17:00'];
      for (const depTime of depTimes) {
        const [hours, minutes] = depTime.split(':');
        const departureTime = new Date(tomorrow);
        departureTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const arrivalTime = new Date(departureTime);
        arrivalTime.setHours(arrivalTime.getHours() + 1);

        const bus = allBuses[busIndex % allBuses.length];
        await pool.query(
          `INSERT INTO trips (bus_id, route_id, departure_time, arrival_time, available_seats, available_standby, status) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [bus.id, route.id, departureTime, arrivalTime, bus.capacity, bus.standby_capacity, 'scheduled']
        );
        busIndex++;
        tripsCount++;
      }
    }

    await pool.query('COMMIT');
    console.log('✅ Trips added!');
    console.log(`🎉 Total Seeding completed successfully!`);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error during seeding:', error);
  } finally {
    await pool.end();
  }
}

seed();
