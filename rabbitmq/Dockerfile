FROM rabbitmq:3-management

# Install dependencies
RUN apt-get update && apt-get install -y curl jq

# Download and install RabbitMQ Delayed Message Plugin
RUN curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez \
    -o /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez

# Set permissions for the plugin
RUN chmod 644 /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez

# Copy configuration files
COPY --chown=rabbitmq:rabbitmq rabbitmq.conf /etc/rabbitmq/
COPY --chown=rabbitmq:rabbitmq definitions.json /etc/rabbitmq/

# Replace placeholders in `definitions.json` with environment variables
RUN export $(cat /etc/rabbitmq/.env | xargs) && \
    jq ".users[0].name=\"$RABBITMQ_DEFAULT_USER\" | .users[0].password=\"$RABBITMQ_DEFAULT_PASS\"" /etc/rabbitmq/definitions.json > /etc/rabbitmq/definitions.json.tmp && \
    mv /etc/rabbitmq/definitions.json.tmp /etc/rabbitmq/definitions.json

# Validate `definitions.json` to ensure it is correct
RUN cat /etc/rabbitmq/definitions.json | jq . > /dev/null

# Set proper permissions for RabbitMQ plugins
RUN chown -R rabbitmq:rabbitmq /opt/rabbitmq/plugins && chmod -R 644 /opt/rabbitmq/plugins/*.ez

# Clear RabbitMQ persistent storage (prevents startup failures)
RUN rm -rf /var/lib/rabbitmq/mnesia

# Set entrypoint to enable plugins at runtime
CMD ["sh", "-c", "rabbitmq-plugins enable rabbitmq_delayed_message_exchange && rabbitmq-server"]
