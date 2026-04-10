using Npgsql;

using NotificationService.Domain;

namespace NotificationService.Infrastructure;

public sealed class NotificationRepository(IConfiguration configuration)
{
    private readonly string _connectionString = BuildConnectionString(configuration);

    public async Task EnsureSchemaAsync(CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = """
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY,
                order_id UUID NOT NULL UNIQUE,
                payment_id UUID NOT NULL,
                customer_email TEXT NOT NULL,
                channel VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL,
                processing_behavior VARCHAR(40) NOT NULL,
                sent_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL
            );
            """;

        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<Notification?> FindByOrderIdAsync(Guid orderId, CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = """
            SELECT
                id,
                order_id,
                payment_id,
                customer_email,
                channel,
                status,
                processing_behavior,
                sent_at,
                created_at,
                updated_at
            FROM notifications
            WHERE order_id = @orderId;
            """;

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("orderId", orderId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return Notification.Restore(
            reader.GetGuid(0),
            reader.GetGuid(1),
            reader.GetGuid(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetString(5),
            reader.GetString(6),
            reader.GetFieldValue<DateTimeOffset>(7),
            reader.GetFieldValue<DateTimeOffset>(8),
            reader.GetFieldValue<DateTimeOffset>(9));
    }

    public async Task SaveAsync(Notification notification, CancellationToken cancellationToken)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        const string sql = """
            INSERT INTO notifications (
                id,
                order_id,
                payment_id,
                customer_email,
                channel,
                status,
                processing_behavior,
                sent_at,
                created_at,
                updated_at
            )
            VALUES (
                @id,
                @orderId,
                @paymentId,
                @customerEmail,
                @channel,
                @status,
                @processingBehavior,
                @sentAt,
                @createdAt,
                @updatedAt
            )
            ON CONFLICT (order_id) DO UPDATE SET
                payment_id = EXCLUDED.payment_id,
                customer_email = EXCLUDED.customer_email,
                channel = EXCLUDED.channel,
                status = EXCLUDED.status,
                processing_behavior = EXCLUDED.processing_behavior,
                sent_at = EXCLUDED.sent_at,
                updated_at = EXCLUDED.updated_at;
            """;

        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("id", notification.Id);
        command.Parameters.AddWithValue("orderId", notification.OrderId);
        command.Parameters.AddWithValue("paymentId", notification.PaymentId);
        command.Parameters.AddWithValue("customerEmail", notification.CustomerEmail);
        command.Parameters.AddWithValue("channel", notification.Channel);
        command.Parameters.AddWithValue("status", notification.Status);
        command.Parameters.AddWithValue("processingBehavior", notification.ProcessingBehavior);
        command.Parameters.AddWithValue("sentAt", notification.SentAt);
        command.Parameters.AddWithValue("createdAt", notification.CreatedAt);
        command.Parameters.AddWithValue("updatedAt", notification.UpdatedAt);

        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string BuildConnectionString(IConfiguration configuration)
    {
        var host = configuration["POSTGRES_HOST"] ?? "localhost";
        var port = configuration["POSTGRES_PORT"] ?? "5432";
        var database = configuration["POSTGRES_DB"] ?? "notification_db";
        var user = configuration["POSTGRES_USER"] ?? "postgres";
        var password = configuration["POSTGRES_PASSWORD"] ?? "postgres";

        return $"Host={host};Port={port};Database={database};Username={user};Password={password}";
    }
}

