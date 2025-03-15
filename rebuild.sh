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

# Remove existing images
print_step "Removing existing Docker images..."
docker rmi paladin-forms-be-app paladin-forms-be-analyzer-feedback || true
print_success "Docker images removed"

# Build and start containers
print_step "Building and starting containers..."
docker compose up -d --build app analyzer-feedback
if [ $? -ne 0 ]; then
    print_error "Failed to build and start containers"
    docker compose logs app analyzer-feedback
    exit 1
fi

# Show running containers
print_step "Running containers:"
docker compose ps app analyzer-feedback

print_success "All done! Your applications are rebuilt and running"

# Show logs
print_step "Showing logs (press Ctrl+C to exit)..."
docker compose logs -f app analyzer-feedback 