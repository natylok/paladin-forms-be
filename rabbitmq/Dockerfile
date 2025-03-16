FROM rabbitmq:3.12-management

# Install the delayed message exchange plugin
RUN apt-get update && apt-get install -y curl && \
    curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    rabbitmq-plugins enable --offline rabbitmq_delayed_message_exchange && \
    apt-get purge -y curl && apt-get autoremove -y && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create startup script
COPY --chown=rabbitmq:rabbitmq <<EOF /usr/local/bin/docker-entrypoint-custom.sh
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
EOF

RUN chmod +x /usr/local/bin/docker-entrypoint-custom.sh

CMD ["/usr/local/bin/docker-entrypoint-custom.sh"]
