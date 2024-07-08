namespace Spector.Model;

public interface IRemoteDevice : IDevice
{
    bool Connected { get; }
}

public interface ILocalDevice : IDevice
{
    Task ConnectAsync(string address);
}