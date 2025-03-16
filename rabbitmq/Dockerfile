FROM rabbitmq:3-management

# Enable RabbitMQ delayed message plugin
RUN apt-get update && \
    apt-get install -y curl && \
    curl -L https://github.com/rabbitmq/rabbitmq-delayed-message-exchange/releases/download/v3.12.0/rabbitmq_delayed_message_exchange-3.12.0.ez > /plugins/rabbitmq_delayed_message_exchange-3.12.0.ez && \
    rabbitmq-plugins enable rabbitmq_delayed_message_exchange

# Copy custom configuration
COPY rabbitmq.conf /etc/rabbitmq/
COPY definitions.json /etc/rabbitmq/

CMD ["rabbitmq-server"] 