using NAudio.Wave;

namespace Spector.Model;

public interface ILocalDevice : IDevice
{
    Task ConnectAsync(string address);

    IEnumerable<WaveFormat> GetAvailableWaveFormats();
}