namespace Spector.Model;

public interface IDevice : IDisposable
{
    DeviceId Id { get; }
}