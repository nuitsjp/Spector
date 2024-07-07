namespace Spector.Model;

public interface IRemoteDevice : IDevice
{
    bool Connected { get; }
    Task ConnectAsync();
    Task DisconnectAsync();
}