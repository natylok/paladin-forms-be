#!/bin/bash
set -e

# First run the original entrypoint script
docker-entrypoint.sh rabbitmq-server -detached

# Wait for RabbitMQ to be ready
until rabbitmqctl await_startup; do
    sleep 2
done

echo "Configuring RabbitMQ users..."

# Delete default guest user
rabbitmqctl delete_user guest || true

# Add new user with admin privileges
rabbitmqctl add_user "$RABBITMQ_DEFAULT_USER" "$RABBITMQ_DEFAULT_PASS" || true
rabbitmqctl set_user_tags "$RABBITMQ_DEFAULT_USER" administrator
rabbitmqctl set_permissions -p / "$RABBITMQ_DEFAULT_USER" ".*" ".*" ".*"

# Stop the background instance
rabbitmqctl stop_app

# Start RabbitMQ in the foreground
exec rabbitmq-server 