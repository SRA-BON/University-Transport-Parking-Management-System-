-- University Transport & Parking Management System
-- Full Database Setup Script for Supabase
-- Safe to run multiple times: uses IF NOT EXISTS and ON CONFLICT everywhere.


-- TABLES

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    student_id VARCHAR(50) UNIQUE,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    google_id VARCHAR(255) UNIQUE,
    role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'super_admin', 'manager', 'bus_attendant', 'parking_attendant')),
    no_show_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    rfid_id VARCHAR(100) UNIQUE,
    department VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Wallets
CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(10, 2) DEFAULT 0.00 CHECK (balance >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Routes
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    classification VARCHAR(30) NOT NULL CHECK (classification IN ('standard', 'narayanganj', 'bashundhara')),
    single_trip_fare DECIMAL(10, 2) NOT NULL,
    round_trip_fare DECIMAL(10, 2) NOT NULL,
    booking_window_minutes INTEGER NOT NULL DEFAULT 180,
    free_cancel_minutes INTEGER NOT NULL DEFAULT 60,
    emergency_cancel_penalty DECIMAL(10,2) NOT NULL DEFAULT 50.00,
    no_show_grace_minutes INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Route Stoppages
CREATE TABLE IF NOT EXISTS route_stoppages (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Buses
CREATE TABLE IF NOT EXISTS buses (
    id SERIAL PRIMARY KEY,
    bus_number VARCHAR(50) UNIQUE NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 40,
    standby_capacity INTEGER NOT NULL DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Trips
CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    bus_id INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    departure_time TIMESTAMP NOT NULL,
    arrival_time TIMESTAMP,
    available_seats INTEGER NOT NULL,
    available_standby INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'delayed')),
    no_show_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Trip Stoppage Times
CREATE TABLE IF NOT EXISTS trip_stoppage_times (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    stoppage_id INTEGER NOT NULL REFERENCES route_stoppages(id) ON DELETE CASCADE,
    pickup_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Bookings
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    seat_number INTEGER,
    is_standby BOOLEAN DEFAULT FALSE,
    standby_position INTEGER,
    status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'checked_in', 'no_show')),
    fare_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    penalty_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    cancellation_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_rfid_scanned BOOLEAN DEFAULT FALSE,
    scanned_at TIMESTAMP,
    scan_device VARCHAR(100),
    no_show_processed BOOLEAN DEFAULT FALSE,
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    checked_in_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    UNIQUE(trip_id, seat_number) DEFERRABLE INITIALLY DEFERRED
);

-- 9. Transactions
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('recharge', 'payment', 'refund', 'penalty')),
    description TEXT,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Check-ins
CREATE TABLE IF NOT EXISTS check_ins (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    checked_in_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    district VARCHAR(100) NOT NULL,
    vehicle_type VARCHAR(10) NOT NULL CHECK (vehicle_type IN ('La', 'Ha', 'Ga')),
    reg_number VARCHAR(20) NOT NULL,
    vehicle_reg_no VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Parking Sessions
CREATE TABLE IF NOT EXISTS parking_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    vehicle_reg_no VARCHAR(100) NOT NULL,
    digital_token VARCHAR(10) NOT NULL UNIQUE,
    entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    exit_time TIMESTAMP,
    duration_minutes INTEGER,
    fee DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Parking Capacity
CREATE TABLE IF NOT EXISTS parking_capacity (
    id SERIAL PRIMARY KEY,
    car_total_spots INTEGER NOT NULL DEFAULT 200,
    car_occupied_spots INTEGER NOT NULL DEFAULT 0,
    bike_total_spots INTEGER NOT NULL DEFAULT 400,
    bike_occupied_spots INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Parking Fees
CREATE TABLE IF NOT EXISTS parking_fees (
    id SERIAL PRIMARY KEY,
    fixed_fee DECIMAL(10,2) NOT NULL DEFAULT 30.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Pending Payments
CREATE TABLE IF NOT EXISTS pending_payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    gateway_response JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Password Resets
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. FCM Tokens
CREATE TABLE IF NOT EXISTS fcm_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(255) UNIQUE NOT NULL,
    device_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. User Frequent Routes
CREATE TABLE IF NOT EXISTS user_frequent_routes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    booking_count INTEGER DEFAULT 1,
    last_booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, route_id)
);


-- INDEXES

CREATE INDEX IF NOT EXISTS idx_users_rfid_id ON users(rfid_id);
CREATE INDEX IF NOT EXISTS idx_trips_route_departure ON trips(route_id, departure_time);
CREATE INDEX IF NOT EXISTS idx_bookings_user_active ON bookings(user_id) WHERE status IN ('confirmed', 'checked_in');
CREATE INDEX IF NOT EXISTS idx_bookings_trip_status ON bookings(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_user_trip ON bookings(user_id, trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_unique_reg ON vehicles(vehicle_reg_no);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_user ON parking_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_parking_sessions_status ON parking_sessions(status);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_frequent_routes_user ON user_frequent_routes(user_id);


-- FUNCTIONS

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION set_default_vehicle_on_first()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM vehicles WHERE user_id = NEW.user_id) = 0 THEN
        NEW.is_default = TRUE;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';


-- TRIGGERS (safe to re-run: drop-trigger-then-recreate)

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_trips_updated_at ON trips;
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_vehicles_updated_at ON vehicles;
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS vehicles_set_default ON vehicles;
CREATE TRIGGER vehicles_set_default BEFORE INSERT ON vehicles FOR EACH ROW EXECUTE FUNCTION set_default_vehicle_on_first();

DROP TRIGGER IF EXISTS update_parking_sessions_updated_at ON parking_sessions;
CREATE TRIGGER update_parking_sessions_updated_at BEFORE UPDATE ON parking_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_parking_capacity_updated_at ON parking_capacity;
CREATE TRIGGER update_parking_capacity_updated_at BEFORE UPDATE ON parking_capacity FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pending_payments_updated_at ON pending_payments;
CREATE TRIGGER update_pending_payments_updated_at BEFORE UPDATE ON pending_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- SEED DATA (all inserts use ON CONFLICT DO NOTHING - safe to re-run)

-- Admin user (password: admin123)
INSERT INTO users (name, student_id, email, password_hash, role, is_active)
VALUES ('admin', 'ADMIN', 'admin@gmail.com', '$2b$10$Z8elUYYxqhtX6YZ4kgCmBewVA3eq5PywEkpfLhB0qB5xxa6bcH0CO', 'super_admin', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO wallets (user_id, balance)
SELECT id, 0 FROM users WHERE email = 'admin@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Parking settings
INSERT INTO parking_capacity (car_total_spots, car_occupied_spots, bike_total_spots, bike_occupied_spots)
SELECT 200, 0, 400, 0
WHERE NOT EXISTS (SELECT 1 FROM parking_capacity);

INSERT INTO parking_fees (fixed_fee)
SELECT 30.00
WHERE NOT EXISTS (SELECT 1 FROM parking_fees);

-- Buses
INSERT INTO buses (bus_number, capacity, standby_capacity) VALUES
('BUS-01', 40, 10), ('BUS-02', 40, 10), ('BUS-03', 40, 10),
('BUS-04', 40, 10), ('BUS-05', 40, 10), ('BUS-06', 40, 10),
('BUS-07', 40, 10), ('BUS-08', 40, 10), ('BUS-09', 40, 10),
('BUS-10', 40, 10), ('BUS-11', 40, 10), ('BUS-12', 40, 10)
ON CONFLICT (bus_number) DO NOTHING;

-- Routes
INSERT INTO routes (name, direction, classification, single_trip_fare, round_trip_fare, booking_window_minutes, free_cancel_minutes, emergency_cancel_penalty, no_show_grace_minutes) VALUES
('Abdullahpur-A (Route 01)', 'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Abdullahpur-B (Route 01)', 'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Mirpur-A (Route 02)',      'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Mirpur-B (Route 02)',      'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Jigatola-A (Route 03)',    'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Jigatola-B (Route 03)',    'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Azimpur (Route 04)',       'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Baldha Garden (Route 05)', 'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Mohammadpur-A (Route 06)', 'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Mohammadpur-B (Route 06)', 'outbound', 'standard',    110.00, 220.00, 180, 60, 50.00, 5),
('Narayanganj (Route 07)',   'outbound', 'narayanganj', 160.00, 320.00, 180, 60, 50.00, 5),
('Bashundhara (Route 08)',   'outbound', 'bashundhara',  50.00, 100.00, 180, 60, 50.00, 5)
ON CONFLICT DO NOTHING;

-- Trips (only seed if trips table is empty)
DO $$
DECLARE
    today DATE := CURRENT_DATE;
BEGIN
    IF (SELECT COUNT(*) FROM trips) = 0 THEN

        -- Batch 1: 2:05 PM and 2:10 PM departures
        INSERT INTO trips (bus_id, route_id, departure_time, available_seats, available_standby, status) VALUES
        (1,  1,  today + INTERVAL '14 hours 5 minutes',  40, 10, 'scheduled'),
        (2,  3,  today + INTERVAL '14 hours 5 minutes',  40, 10, 'scheduled'),
        (3,  4,  today + INTERVAL '14 hours 5 minutes',  40, 10, 'scheduled'),
        (4,  5,  today + INTERVAL '14 hours 5 minutes',  40, 10, 'scheduled'),
        (5,  7,  today + INTERVAL '14 hours 5 minutes',  40, 10, 'scheduled'),
        (6,  8,  today + INTERVAL '14 hours 10 minutes', 40, 10, 'scheduled'),
        (7,  9,  today + INTERVAL '14 hours 10 minutes', 40, 10, 'scheduled'),
        (8,  10, today + INTERVAL '14 hours 5 minutes',  40, 10, 'scheduled'),
        (9,  12, today + INTERVAL '14 hours 5 minutes',  40, 10, 'scheduled');

        -- Batch 2: 5:10 PM and 5:15 PM departures
        INSERT INTO trips (bus_id, route_id, departure_time, available_seats, available_standby, status) VALUES
        (10, 1,  today + INTERVAL '17 hours 10 minutes', 40, 10, 'scheduled'),
        (11, 2,  today + INTERVAL '17 hours 15 minutes', 40, 10, 'scheduled'),
        (12, 3,  today + INTERVAL '17 hours 10 minutes', 40, 10, 'scheduled'),
        (1,  4,  today + INTERVAL '17 hours 10 minutes', 40, 10, 'scheduled'),
        (2,  5,  today + INTERVAL '17 hours 10 minutes', 40, 10, 'scheduled'),
        (3,  6,  today + INTERVAL '17 hours 15 minutes', 40, 10, 'scheduled'),
        (4,  7,  today + INTERVAL '17 hours 10 minutes', 40, 10, 'scheduled'),
        (5,  8,  today + INTERVAL '17 hours 15 minutes', 40, 10, 'scheduled'),
        (6,  9,  today + INTERVAL '17 hours 10 minutes', 40, 10, 'scheduled'),
        (7,  10, today + INTERVAL '17 hours 15 minutes', 40, 10, 'scheduled'),
        (8,  11, today + INTERVAL '17 hours 15 minutes', 40, 10, 'scheduled'),
        (9,  12, today + INTERVAL '17 hours 10 minutes', 40, 10, 'scheduled');

    END IF;
END $$;
