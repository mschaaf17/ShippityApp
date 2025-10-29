-- Shippity Database Schema
-- Run this against your Postgres database (Supabase or Render)

-- Users table (for internal broker users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'broker',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  contact_type VARCHAR(20) DEFAULT 'INDIVIDUAL', -- INDIVIDUAL or COMPANY
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Loads table (orders/shipments)
CREATE TABLE IF NOT EXISTS loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(100) UNIQUE, -- Super Dispatch order ID
  customer_id UUID REFERENCES customers(id),
  
  -- Vehicle details
  vehicle_year VARCHAR(10),
  vehicle_make VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_vin VARCHAR(50),
  vehicle_condition VARCHAR(50),
  
  -- Locations
  pickup_address TEXT NOT NULL,
  pickup_city VARCHAR(100),
  pickup_state VARCHAR(50),
  pickup_zip VARCHAR(20),
  pickup_date DATE,
  
  delivery_address TEXT NOT NULL,
  delivery_city VARCHAR(100),
  delivery_state VARCHAR(50),
  delivery_zip VARCHAR(20),
  delivery_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, DISPATCHED, IN_TRANSIT, DELIVERED, COMPLETED
  priority VARCHAR(20) DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
  
  -- Carrier info
  carrier_name VARCHAR(255),
  carrier_phone VARCHAR(50),
  driver_name VARCHAR(255),
  driver_phone VARCHAR(50),
  
  -- Financial
  quote_amount DECIMAL(10, 2),
  commission DECIMAL(10, 2),
  
  -- Documents
  bol_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  picked_up_at TIMESTAMP,
  delivered_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Communication log
CREATE TABLE IF NOT EXISTS communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES loads(id),
  customer_id UUID REFERENCES customers(id),
  
  type VARCHAR(20) NOT NULL, -- EMAIL or SMS
  direction VARCHAR(20) NOT NULL, -- OUTBOUND or INBOUND
  recipient VARCHAR(255) NOT NULL, -- email or phone
  
  subject VARCHAR(255),
  content TEXT,
  
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SENT, DELIVERED, FAILED
  
  error_message TEXT,
  
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity log (audit trail)
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES loads(id),
  user_id UUID REFERENCES users(id),
  
  action VARCHAR(100) NOT NULL,
  description TEXT,
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_loads_customer ON loads(customer_id);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_order_id ON loads(order_id);
CREATE INDEX IF NOT EXISTS idx_communication_load ON communication_log(load_id);
CREATE INDEX IF NOT EXISTS idx_communication_recipient ON communication_log(recipient);
CREATE INDEX IF NOT EXISTS idx_activity_load ON activity_log(load_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loads_updated_at BEFORE UPDATE ON loads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

