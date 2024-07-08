namespace Spector.Model;

public interface IRemoteDevice : IDevice
{
    event EventHandler? Disconnected;
}