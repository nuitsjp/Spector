namespace Spector.Model;

public interface IDevice : IDisposable
{
    DeviceId Id { get; }
    string Name { get; }
    Decibel Level { get; }
}