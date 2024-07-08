namespace Spector.Model;

public interface ILocalDevice : IDevice
{
    Task ConnectAsync(string address);
}