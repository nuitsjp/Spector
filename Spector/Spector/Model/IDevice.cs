﻿using System.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using UnitGenerator;

namespace Spector.Model;

[UnitOf<string>(UnitGenerateOptions.JsonConverter)]
public partial struct DeviceId; 

public interface IDevice : INotifyPropertyChanged, IDisposable
{
    event EventHandler<WaveInEventArgs> DataAvailable;
    event EventHandler<EventArgs> Disconnected;
    DeviceId Id { get; }
    DataFlow DataFlow { get; }
    WaveFormat WaveFormat { get; }
    string Name { get; set; }
    string SystemName { get; }
    bool Measure { get; }
    bool Connectable { get; }
    bool IsConnected { get; }

    /// <summary>
    /// 入出力レベル
    /// </summary>
    VolumeLevel VolumeLevel { get; set; }

    /// <summary>
    /// 音量レベル
    /// </summary>
    Decibel Level { get; }

    void Disconnect();

    void StartMeasure();
    void StopMeasure();

    void StartPlayback();
    void StopPlayback();
}