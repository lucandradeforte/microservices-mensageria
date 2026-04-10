using System.Text.Json;

using NotificationService.Contracts;
using NotificationService.Domain;
using NotificationService.Observability;

using RabbitMQ.Client;

namespace NotificationService.Infrastructure;

public sealed class RabbitMqPublisher : IDisposable
{
    private readonly ILogger<RabbitMqPublisher> _logger;
    private readonly string _rabbitMqUrl;
    private readonly JsonSerializerOptions _serializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly Lazy<IConnection> _connection;
    private readonly Lazy<IModel> _channel;

    public RabbitMqPublisher(IConfiguration configuration, ILogger<RabbitMqPublisher> logger)
    {
        _logger = logger;
        _rabbitMqUrl = configuration["RABBITMQ_URL"] ?? "amqp://guest:guest@localhost:5672";
        _connection = new Lazy<IConnection>(CreateConnection);
        _channel = new Lazy<IModel>(CreateChannel);
    }

    public Task PublishNotificationSentAsync(Notification notification, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var correlationId = CorrelationContext.GetOrCreate();
        var payload = new NotificationSentEvent(
            notification.Id,
            notification.OrderId,
            notification.PaymentId,
            notification.CustomerEmail,
            notification.Channel,
            notification.Status,
            notification.ProcessingBehavior,
            notification.SentAt);
        var envelope = new EventEnvelope<NotificationSentEvent>(
            EventNames.NotificationSent,
            "1.0.0",
            DateTimeOffset.UtcNow,
            correlationId,
            payload);

        var body = JsonSerializer.SerializeToUtf8Bytes(envelope, _serializerOptions);
        var properties = _channel.Value.CreateBasicProperties();
        properties.Persistent = true;
        properties.ContentType = "application/json";
        properties.CorrelationId = correlationId;
        properties.Headers = new Dictionary<string, object>
        {
            ["x-correlation-id"] = correlationId
        };

        _channel.Value.BasicPublish(Exchanges.Events, EventNames.NotificationSent, properties, body);

        _logger.LogInformation(
            "Published notification sent event for order {OrderId}",
            notification.OrderId);

        return Task.CompletedTask;
    }

    public void Dispose()
    {
        if (_channel.IsValueCreated)
        {
            _channel.Value.Close();
            _channel.Value.Dispose();
        }

        if (_connection.IsValueCreated)
        {
            _connection.Value.Close();
            _connection.Value.Dispose();
        }
    }

    private IConnection CreateConnection()
    {
        var factory = new ConnectionFactory
        {
            Uri = new Uri(_rabbitMqUrl),
            DispatchConsumersAsync = true,
            AutomaticRecoveryEnabled = true
        };

        return factory.CreateConnection();
    }

    private IModel CreateChannel()
    {
        var channel = _connection.Value.CreateModel();
        AssertSharedTopology(channel);

        return channel;
    }

    private static void AssertSharedTopology(IModel channel)
    {
        channel.ExchangeDeclare(Exchanges.Events, ExchangeType.Topic, durable: true);
        channel.ExchangeDeclare(Exchanges.Retry, ExchangeType.Topic, durable: true);
        channel.ExchangeDeclare(Exchanges.DeadLetter, ExchangeType.Topic, durable: true);
    }
}

