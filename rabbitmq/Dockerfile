FROM rabbitmq:3-management

# Enable RabbitMQ delayed message plugin
RUN apt-get update && \
    apt-get install -y curl && \
    mkdir -p /plugins && \
    curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    chown rabbitmq:rabbitmq /opt/rabbitmq/plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    rabbitmq-plugins enable rabbitmq_delayed_message_exchange

# Copy custom configuration
COPY --chown=rabbitmq:rabbitmq rabbitmq.conf /etc/rabbitmq/
COPY --chown=rabbitmq:rabbitmq definitions.json /etc/rabbitmq/

CMD ["rabbitmq-server"] 