using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Spector.Model;

public interface IDevice : INotifyPropertyChanged, IDisposable
{
    event EventHandler<WaveInEventArgs> DataAvailable;
    DeviceId Id { get; }
    DataFlow DataFlow { get; }
    WaveFormat WaveFormat { get; }
    string Name { get; set; }
    string SystemName { get; }
    bool Measure { get; }

    /// <summary>
    /// 入出力レベル
    /// </summary>
    VolumeLevel VolumeLevel { get; set; }

    /// <summary>
    /// 音量レベル
    /// </summary>
    Decibel Level { get; }

    void StartMeasure();
    void StopMeasure();

    void PlayLooping(CancellationToken token);
}

public partial class RemoteDevice : ObservableObject, IDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;
    public DeviceId Id { get; }
    public DataFlow DataFlow { get; }
    public WaveFormat WaveFormat { get; }
    public string Name { get; set; }
    public string SystemName { get; }
    public bool Measure { get; }
    public VolumeLevel VolumeLevel { get; set; }
    public Decibel Level { get; }
    public void StartMeasure()
    {
        throw new NotImplementedException();
    }

    public void StopMeasure()
    {
        throw new NotImplementedException();
    }

    public void PlayLooping(CancellationToken token)
    {
        throw new NotImplementedException();
    }

    public void Dispose()
    {
        // TODO release managed resources here
    }
}