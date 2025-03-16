FROM rabbitmq:3.12-management

# Install dependencies
RUN apt-get update && apt-get install -y curl jq

# Download and install the delayed message exchange plugin
RUN curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > /plugins/rabbitmq_delayed_message_exchange-3.12.0.ez \
    && chown rabbitmq:rabbitmq /plugins/rabbitmq_delayed_message_exchange-3.12.0.ez \
    && chmod 644 /plugins/rabbitmq_delayed_message_exchange-3.12.0.ez \
    && apt-get purge -y curl && apt-get autoremove -y && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Enable management plugin
RUN rabbitmq-plugins enable --offline rabbitmq_management

# Copy configuration files
COPY --chown=rabbitmq:rabbitmq rabbitmq.conf /etc/rabbitmq/
COPY --chown=rabbitmq:rabbitmq definitions.json /etc/rabbitmq/

# Replace placeholders in `definitions.json` with environment variables
RUN export $(cat /etc/rabbitmq/.env | xargs) && \
    jq ".users[0].name=\"$RABBITMQ_DEFAULT_USER\" | .users[0].password=\"$RABBITMQ_DEFAULT_PASS\"" /etc/rabbitmq/definitions.json > /etc/rabbitmq/definitions.json.tmp && \
    mv /etc/rabbitmq/definitions.json.tmp /etc/rabbitmq/definitions.json

# Validate `definitions.json` to ensure it is correct
RUN cat /etc/rabbitmq/definitions.json | jq . > /dev/null

# Enable plugins
RUN rabbitmq-plugins enable rabbitmq_delayed_message_exchange

# Set proper permissions
RUN chown -R rabbitmq:rabbitmq /etc/rabbitmq

# Clear RabbitMQ persistent storage (prevents startup failures)
RUN rm -rf /var/lib/rabbitmq/mnesia

# Set entrypoint to enable plugins at runtime
CMD ["sh", "-c", "rabbitmq-plugins enable rabbitmq_delayed_message_exchange && rabbitmq-server"]
