-- Migration Script for Kingbee Integration
-- Run this script to add Kingbee integration support to existing Shippity database

-- Step 1: Add reference_id column to loads table (if not exists)
ALTER TABLE loads ADD COLUMN IF NOT EXISTS reference_id VARCHAR(255);
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMP;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_time TIMESTAMP;

-- Step 2: Create webhook_config table (if not exists)
CREATE TABLE IF NOT EXISTS webhook_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  secret_token VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Create webhook_delivery_log table (if not exists)
CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id UUID REFERENCES webhook_config(id),
  load_id UUID REFERENCES loads(id),
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  status_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP
);

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_loads_reference_id ON loads(reference_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_load ON webhook_delivery_log(load_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_config ON webhook_delivery_log(webhook_config_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_status ON webhook_delivery_log(status);

-- Step 5: Create trigger for webhook_config updated_at (if not exists)
CREATE TRIGGER update_webhook_config_updated_at 
  BEFORE UPDATE ON webhook_config
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Verify migration
SELECT 
  'Migration completed successfully!' as message,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'loads' AND column_name = 'reference_id') as loads_reference_id_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'webhook_config') as webhook_config_exists,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'webhook_delivery_log') as webhook_delivery_log_exists;

