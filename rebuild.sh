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

# Clean up previous builds
print_step "Cleaning up previous builds..."
rm -rf dist node_modules
cd analyzer-feedback && rm -rf dist node_modules && cd ..
print_success "Clean up completed"

# Remove existing images to force rebuild
print_step "Removing existing Docker images..."
docker-compose rm -f
docker rmi paladin-forms-be-app paladin-forms-be-analyzer-feedback || true
print_success "Docker images removed"

# Build and start Docker containers with rebuild
print_step "Building and starting Docker containers..."
docker-compose build --no-cache
if [ $? -ne 0 ]; then
    print_error "Docker build failed"
    exit 1
fi

docker-compose up -d
if [ $? -ne 0 ]; then
    print_error "Docker containers failed to start"
    exit 1
fi
print_success "Docker containers started successfully"

# Show running containers
print_step "Running containers:"
docker-compose ps

print_success "All done! Your applications are rebuilt and running"

# Show logs
print_step "Showing logs (press Ctrl+C to exit)..."
docker-compose logs -f 