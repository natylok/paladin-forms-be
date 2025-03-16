#!/bin/bash
set -e

# Start RabbitMQ in the background
rabbitmq-server -detached

# Wait for RabbitMQ to start
sleep 5

# Delete default guest user
rabbitmqctl delete_user guest || true

# Add new user with admin privileges
rabbitmqctl add_user "$RABBITMQ_DEFAULT_USER" "$RABBITMQ_DEFAULT_PASS"
rabbitmqctl set_user_tags "$RABBITMQ_DEFAULT_USER" administrator
rabbitmqctl set_permissions -p / "$RABBITMQ_DEFAULT_USER" ".*" ".*" ".*"

# Stop the detached RabbitMQ
rabbitmqctl stop

# Start RabbitMQ in the foreground
exec rabbitmq-server 