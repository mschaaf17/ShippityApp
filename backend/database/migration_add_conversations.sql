-- Migration: Add conversations table and update communication_log
-- Run this after schema.sql if you have an existing database

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  participant_type VARCHAR(20) DEFAULT 'UNKNOWN',
  participant_name VARCHAR(255),
  load_id UUID REFERENCES loads(id),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add conversation_id column to communication_log if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'communication_log' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE communication_log 
    ADD COLUMN conversation_id UUID REFERENCES conversations(id);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_email ON conversations(email);
CREATE INDEX IF NOT EXISTS idx_conversations_load ON conversations(load_id);
CREATE INDEX IF NOT EXISTS idx_communication_conversation ON communication_log(conversation_id);

-- Create trigger for conversations updated_at
CREATE TRIGGER update_conversations_updated_at 
  BEFORE UPDATE ON conversations
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

