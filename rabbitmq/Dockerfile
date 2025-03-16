FROM rabbitmq:3.12-management

# Install the delayed message exchange plugin
RUN apt-get update && apt-get install -y curl && \
    curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    rabbitmq-plugins enable --offline rabbitmq_delayed_message_exchange && \
    apt-get purge -y curl && apt-get autoremove -y && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy configuration files
COPY --chown=rabbitmq:rabbitmq rabbitmq.conf /etc/rabbitmq/
COPY --chown=rabbitmq:rabbitmq definitions.json /etc/rabbitmq/

# Set proper permissions
RUN chown -R rabbitmq:rabbitmq /etc/rabbitmq

# Start RabbitMQ server
CMD ["rabbitmq-server"]
