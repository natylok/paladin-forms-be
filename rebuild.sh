#!/bin/bash

# Print colored output
print_step() {
    echo -e "\n\033[1;34m👉 $1\033[0m"
}

print_success() {
    echo -e "\033[1;32m✅ $1\033[0m"
}

print_error() {
    echo -e "\033[1;31m❌ $1\033[0m"
}

# Stop running containers
print_step "Stopping running containers..."
docker-compose down
print_success "Containers stopped"

# Build main application
print_step "Building main application (paladin-forms-be)..."
npm install
npm run build
if [ $? -ne 0 ]; then
    print_error "Main application build failed"
    exit 1
fi
print_success "Main application built successfully"

# Build analyzer feedback application
print_step "Building analyzer feedback application..."
cd analyzer-feedback
npm install
npm run build
if [ $? -ne 0 ]; then
    print_error "Analyzer feedback application build failed"
    exit 1
fi
cd ..
print_success "Analyzer feedback application built successfully"

# Build and start Docker containers
print_step "Building and starting Docker containers..."
docker compose build
docker compose up -d
if [ $? -ne 0 ]; then
    print_error "Docker containers failed to start"
    exit 1
fi
print_success "Docker containers started successfully"

# Show running containers
print_step "Running containers:"
docker compose ps

print_success "All done! Your applications are rebuilt and running" 