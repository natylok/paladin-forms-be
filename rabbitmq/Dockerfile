FROM rabbitmq:3-management

# Enable RabbitMQ delayed message plugin
RUN apt-get update && \
    apt-get install -y curl && \
    curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    chmod 644 /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    rabbitmq-plugins enable --offline rabbitmq_delayed_message_exchange

# Copy custom configuration
COPY --chown=rabbitmq:rabbitmq rabbitmq.conf /etc/rabbitmq/
COPY --chown=rabbitmq:rabbitmq definitions.json /etc/rabbitmq/

# Set proper permissions
RUN chown -R rabbitmq:rabbitmq /opt/rabbitmq/plugins \
    && chmod -R 644 /opt/rabbitmq/plugins/*.ez

CMD ["rabbitmq-server"] 