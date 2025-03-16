FROM rabbitmq:3-management

# Enable RabbitMQ delayed message plugin
RUN apt-get update && \
    apt-get install -y curl jq && \
    curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    chmod 644 /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez

# Copy custom configuration files
COPY --chown=rabbitmq:rabbitmq rabbitmq.conf /etc/rabbitmq/
COPY --chown=rabbitmq:rabbitmq definitions.json /etc/rabbitmq/

# Set proper permissions
RUN chown -R rabbitmq:rabbitmq /opt/rabbitmq/plugins \
    && chmod -R 644 /opt/rabbitmq/plugins/*.ez

# Validate definitions.json (prevents RabbitMQ from crashing on startup)
RUN cat /etc/rabbitmq/definitions.json | jq . > /dev/null

# Clear RabbitMQ persistent storage (prevents startup failures)
RUN rm -rf /var/lib/rabbitmq/mnesia

# Set entrypoint to enable plugins at runtime
CMD ["sh", "-c", "rabbitmq-plugins enable rabbitmq_delayed_message_exchange && rabbitmq-server"]
