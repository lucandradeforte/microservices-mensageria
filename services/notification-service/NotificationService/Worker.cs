using System.Text.Json;

using NotificationService.Application;
using NotificationService.Contracts;
using NotificationService.Observability;
using NotificationService.Infrastructure;

using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace NotificationService;

public sealed class Worker(
    ILogger<Worker> logger,
    IConfiguration configuration,
    NotificationRepository notificationRepository,
    SendNotificationUseCase sendNotificationUseCase) : BackgroundService
{
    private const string QueueName = "notification-service.payment-processed";
    private const string RetryQueueName = "notification-service.payment-processed.retry";
    private const string DeadLetterQueueName = "notification-service.payment-processed.dlq";

    private readonly int _maxRetries = int.TryParse(configuration["MAX_RETRIES"], out var maxRetries) ? maxRetries : 3;
    private readonly int _retryTtlMs = int.TryParse(configuration["RETRY_TTL_MS"], out var retryTtlMs) ? retryTtlMs : 5000;
    private readonly string _rabbitMqUrl = configuration["RABBITMQ_URL"] ?? "amqp://guest:guest@localhost:5672";
    private readonly JsonSerializerOptions _serializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private IConnection? _connection;
    private IModel? _channel;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await notificationRepository.EnsureSchemaAsync(stoppingToken);
        StartConsumer(stoppingToken);

        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    public override void Dispose()
    {
        _channel?.Close();
        _channel?.Dispose();
        _connection?.Close();
        _connection?.Dispose();

        base.Dispose();
    }

    private void StartConsumer(CancellationToken stoppingToken)
    {
        var factory = new ConnectionFactory
        {
            Uri = new Uri(_rabbitMqUrl),
            DispatchConsumersAsync = true,
            AutomaticRecoveryEnabled = true
        };

        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        AssertTopology(_channel);
        _channel.BasicQos(0, 1, false);

        var consumer = new AsyncEventingBasicConsumer(_channel);
        consumer.Received += async (_, eventArgs) =>
        {
            if (_channel is null)
            {
                return;
            }

            var envelope = JsonSerializer.Deserialize<EventEnvelope<PaymentProcessedEvent>>(
                eventArgs.Body.ToArray(),
                _serializerOptions) ?? throw new InvalidOperationException("Could not deserialize payment processed event.");
            var correlationId = string.IsNullOrWhiteSpace(envelope.CorrelationId)
                ? Guid.NewGuid().ToString()
                : envelope.CorrelationId;
            var retryCount = ExtractRetryCount(eventArgs.BasicProperties.Headers);

            using var correlationScope = CorrelationContext.BeginScope(correlationId);
            using var loggerScope = logger.BeginScope(new Dictionary<string, object?>
            {
                ["CorrelationId"] = correlationId,
                ["EventName"] = envelope.EventName
            });

            try
            {
                logger.LogInformation(
                    "Consumed payment processed event for order {OrderId} with retry count {RetryCount}",
                    envelope.Payload.OrderId,
                    retryCount);

                await sendNotificationUseCase.ExecuteAsync(envelope.Payload, retryCount, stoppingToken);
                _channel.BasicAck(eventArgs.DeliveryTag, false);
            }
            catch (Exception exception)
            {
                HandleFailure(_channel, eventArgs, envelope, retryCount, exception);
                _channel.BasicAck(eventArgs.DeliveryTag, false);
            }
        };

        _channel.BasicConsume(QueueName, autoAck: false, consumer);
        logger.LogInformation("Notification consumer ready on queue {QueueName}", QueueName);
    }

    private void HandleFailure(
        IModel channel,
        BasicDeliverEventArgs eventArgs,
        EventEnvelope<PaymentProcessedEvent> envelope,
        int retryCount,
        Exception exception)
    {
        var nextRetryCount = retryCount + 1;
        var body = JsonSerializer.SerializeToUtf8Bytes(envelope, _serializerOptions);
        var properties = channel.CreateBasicProperties();
        properties.Persistent = true;
        properties.ContentType = "application/json";
        properties.CorrelationId = envelope.CorrelationId;
        properties.Headers = new Dictionary<string, object>
        {
            ["x-correlation-id"] = envelope.CorrelationId,
            ["x-retry-count"] = nextRetryCount,
            ["x-original-queue"] = QueueName
        };

        if (nextRetryCount <= _maxRetries)
        {
            channel.BasicPublish(Exchanges.Retry, EventNames.PaymentProcessed, properties, body);
            logger.LogWarning(
                exception,
                "Message sent to retry queue {QueueName} for order {OrderId} on retry {RetryCount}",
                RetryQueueName,
                envelope.Payload.OrderId,
                nextRetryCount);
            return;
        }

        properties.Headers["x-error"] = exception.Message;
        channel.BasicPublish(Exchanges.DeadLetter, EventNames.PaymentProcessed, properties, body);
        logger.LogError(
            exception,
            "Message sent to dead letter queue {QueueName} for order {OrderId}",
            DeadLetterQueueName,
            envelope.Payload.OrderId);
    }

    private void AssertTopology(IModel channel)
    {
        channel.ExchangeDeclare(Exchanges.Events, ExchangeType.Topic, durable: true);
        channel.ExchangeDeclare(Exchanges.Retry, ExchangeType.Topic, durable: true);
        channel.ExchangeDeclare(Exchanges.DeadLetter, ExchangeType.Topic, durable: true);

        channel.QueueDeclare(QueueName, durable: true, exclusive: false, autoDelete: false);
        channel.QueueBind(QueueName, Exchanges.Events, EventNames.PaymentProcessed);

        channel.QueueDeclare(
            RetryQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: new Dictionary<string, object>
            {
                ["x-message-ttl"] = _retryTtlMs,
                ["x-dead-letter-exchange"] = Exchanges.Events,
                ["x-dead-letter-routing-key"] = EventNames.PaymentProcessed
            });
        channel.QueueBind(RetryQueueName, Exchanges.Retry, EventNames.PaymentProcessed);

        channel.QueueDeclare(DeadLetterQueueName, durable: true, exclusive: false, autoDelete: false);
        channel.QueueBind(DeadLetterQueueName, Exchanges.DeadLetter, EventNames.PaymentProcessed);
    }

    private static int ExtractRetryCount(IDictionary<string, object>? headers)
    {
        if (headers is null || !headers.TryGetValue("x-retry-count", out var headerValue))
        {
            return 0;
        }

        return headerValue switch
        {
            byte[] byteArray => int.Parse(System.Text.Encoding.UTF8.GetString(byteArray)),
            int intValue => intValue,
            long longValue => (int)longValue,
            string stringValue => int.Parse(stringValue),
            _ => 0
        };
    }
}
