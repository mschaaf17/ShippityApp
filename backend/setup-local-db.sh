#!/bin/bash

# Setup Local PostgreSQL Database for Shippity
# Run this script to set up your local database

echo "🚀 Setting up local PostgreSQL database for Shippity..."
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found!"
    echo ""
    echo "Installing PostgreSQL via Homebrew..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew not found. Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install PostgreSQL
    echo "📦 Installing PostgreSQL..."
    brew install postgresql@14
    
    # Start PostgreSQL
    echo "🔧 Starting PostgreSQL service..."
    brew services start postgresql@14
    
    echo "⏳ Waiting for PostgreSQL to start..."
    sleep 3
fi

echo "✅ PostgreSQL is installed"
echo ""

# Create database
echo "📝 Creating database 'shippity'..."
if createdb shippity 2>/dev/null; then
    echo "✅ Database 'shippity' created successfully"
else
    echo "⚠️  Database might already exist, continuing..."
fi

echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
# Local PostgreSQL Database
DATABASE_URL=postgresql://localhost:5432/shippity
DATABASE_SSL=false
PORT=3000
EOF
    echo "✅ .env file created"
else
    echo "⚠️  .env file already exists, updating DATABASE_URL..."
    # Update DATABASE_URL if it exists, otherwise add it
    if grep -q "DATABASE_URL" .env; then
        sed -i '' 's|DATABASE_URL=.*|DATABASE_URL=postgresql://localhost:5432/shippity|' .env
        # Ensure DATABASE_SSL is set
        if ! grep -q "DATABASE_SSL" .env; then
            echo "DATABASE_SSL=false" >> .env
        fi
    else
        echo "" >> .env
        echo "# Local PostgreSQL Database" >> .env
        echo "DATABASE_URL=postgresql://localhost:5432/shippity" >> .env
        echo "DATABASE_SSL=false" >> .env
    fi
    echo "✅ .env file updated"
fi

echo ""

# Run schema
echo "📋 Running database schema..."
if psql shippity -f database/schema.sql 2>/dev/null; then
    echo "✅ Database schema created successfully"
else
    echo "❌ Error running schema. Trying alternative method..."
    # Try with connection string
    psql postgresql://localhost:5432/shippity -f database/schema.sql
fi

echo ""
echo "✅ Local database setup complete!"
echo ""
echo "Next steps:"
echo "1. Test connection: npm start"
echo "2. Check database: psql shippity"
echo ""

