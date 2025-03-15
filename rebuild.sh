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

# Stop specific containers
print_step "Stopping application containers..."
docker compose stop app analyzer-feedback
docker compose rm -f app analyzer-feedback
print_success "Containers stopped"

# Clean up previous builds
print_step "Cleaning up previous builds..."
rm -rf dist node_modules
cd analyzer-feedback && rm -rf dist node_modules && cd ..
print_success "Clean up completed"

# Remove existing images to force rebuild
print_step "Removing existing Docker images..."
docker rmi paladin-forms-be-app paladin-forms-be-analyzer-feedback || true
print_success "Docker images removed"

# Build main application first
print_step "Building main application..."
docker compose build app
if [ $? -ne 0 ]; then
    print_error "Main application build failed"
    exit 1
fi

# Verify main application build
docker compose up app -d
if [ $? -ne 0 ]; then
    print_error "Main application failed to start"
    exit 1
fi

# Build analyzer feedback
print_step "Building analyzer feedback..."
docker compose build analyzer-feedback
if [ $? -ne 0 ]; then
    print_error "Analyzer feedback build failed"
    exit 1
fi

# Start analyzer feedback
docker compose up -d analyzer-feedback
if [ $? -ne 0 ]; then
    print_error "Analyzer feedback failed to start"
    exit 1
fi

print_success "Application containers started successfully"

# Show running containers
print_step "Running containers:"
docker compose ps app analyzer-feedback

print_success "All done! Your applications are rebuilt and running"

# Show logs for specific containers
print_step "Showing application logs (press Ctrl+C to exit)..."
docker compose logs -f app analyzer-feedback 