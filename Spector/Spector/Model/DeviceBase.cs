﻿using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using NAudio.Dsp;
using NAudio.Wave;
using Reactive.Bindings.Disposables;

namespace Spector.Model;

public abstract partial class DeviceBase : ObservableObject, IDevice
{
    public event EventHandler<WaveInEventArgs>? DataAvailable;
    public abstract DeviceId Id { get; }
    public abstract DataFlow DataFlow { get; }
    public abstract IReadOnlyList<WaveFormat> AvailableWaveFormats { get; }
    public abstract WaveFormat WaveFormat { get; }
    public abstract string Name { get; set; }
    public abstract string SystemName { get; }
    public abstract bool Measure { get; }
    public abstract bool Connectable { get; }
    public abstract VolumeLevel VolumeLevel { get; set; }
    [ObservableProperty] private Decibel _level;
    private readonly List<Decibel> _levels = [];
    public IReadOnlyList<Decibel> Levels => _levels;

    private IWaveIn? WaveIn { get; set; }
    private BufferedWaveProvider? BufferedWaveProvider { get; set; }
    private AWeightingFilter? Filter { get; set; }
    private int BytesPerSample { get; set; }

    public abstract Task DisconnectAsync();

    protected void StartMeasure(IWaveIn waveIn)
    {
        // WaveInがすでに設定されている場合は、すでに開始済みとして例外をスローする
        if (WaveIn is not null)
        {
            throw new InvalidOperationException("Already started.");
        }

        WaveIn = waveIn;
        BytesPerSample = WaveIn.WaveFormat.BitsPerSample / 8;
        BufferedWaveProvider = new BufferedWaveProvider(WaveIn.WaveFormat);
        Filter = new AWeightingFilter(BufferedWaveProvider.ToSampleProvider());

        WaveIn.DataAvailable += OnDataAvailable;
        WaveIn.RecordingStopped += (_, _) => StopMeasure();
    }


    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        // WaveInがnullの場合、すれ違いで停止されているため、処理を中断する。
        if (WaveIn is null) return;

        if (BufferedWaveProvider is null) throw new InvalidOperationException($"{nameof(BufferedWaveProvider)} is not initialized.");
        if (Filter is null) throw new InvalidOperationException($"{nameof(Filter)} is not initialized.");

        DataAvailable?.Invoke(sender, e);

        BufferedWaveProvider!.AddSamples(e.Buffer, 0, e.BytesRecorded);

        var floatBuffer = new float[e.BytesRecorded / BytesPerSample];

        ConvertToFloat(e.Buffer, floatBuffer, e.BytesRecorded);

        var samplesRead = Filter.Read(floatBuffer, 0, floatBuffer.Length);

        double sumSquares = 0;
        for (var i = 0; i < samplesRead; i++)
        {
            sumSquares += floatBuffer[i] * floatBuffer[i];
        }

        var rms = Math.Sqrt(sumSquares / samplesRead);
        var db = 20 * Math.Log10(rms);
        var level = (Decibel)db;

        Level = Decibel.Minimum <= level ? level : Decibel.Minimum;
        _levels.Add(Level);
    }

    private void ConvertToFloat(byte[] input, float[] output, int bytesRecorded)
    {
        var outputIndex = 0;

        for (var inputIndex = 0; inputIndex < bytesRecorded; inputIndex += BytesPerSample)
        {
            float sample = 0;

            switch (BytesPerSample)
            {
                case 1: // 8-bit PCM
                    sample = (input[inputIndex] - 128) / 128f;
                    break;
                case 2: // 16-bit PCM
                    sample = BitConverter.ToInt16(input, inputIndex) / 32768f;
                    break;
                case 3: // 24-bit PCM
                    var sample24 = (input[inputIndex + 2] << 16) | (input[inputIndex + 1] << 8) | input[inputIndex];
                    if ((sample24 & 0x800000) != 0) sample24 |= ~0xFFFFFF; // Sign extend
                    sample = sample24 / 8388608f;
                    break;
                case 4: // 32-bit PCM or 32-bit IEEE float
                    if (WaveFormat.Encoding == WaveFormatEncoding.IeeeFloat)
                    {
                        sample = BitConverter.ToSingle(input, inputIndex);
                    }
                    else
                    {
                        sample = BitConverter.ToInt32(input, inputIndex) / 2147483648f;
                    }
                    break;
            }

            output[outputIndex++] = sample;
        }
    }

    public abstract void StartMeasure();

    public virtual void StopMeasure()
    {
        // WaveInが設定されていない場合は、未開始として例外をスローする
        if (WaveIn is null)
        {
            throw new InvalidOperationException("Not started.");
        }

        WaveIn.DataAvailable -= OnDataAvailable;
        WaveIn.StopRecording();
        WaveIn.Dispose();
        WaveIn = null;
        BufferedWaveProvider = null;
        Filter = null;
    }

    public abstract void PlayLooping(CancellationToken token);
    public virtual void Dispose()
    {
        // TODO release managed resources here
    }

    public class AWeightingFilter : ISampleProvider
    {
        private readonly ISampleProvider _source;
        private readonly BiQuadFilter[] _filtersLeft;
        private readonly BiQuadFilter[]? _filtersRight;

        public AWeightingFilter(ISampleProvider source)
        {
            _source = source;
            _filtersLeft = CreateFilters(source.WaveFormat.SampleRate);
            if (source.WaveFormat.Channels == 2)
            {
                _filtersRight = CreateFilters(source.WaveFormat.SampleRate);
            }
        }

        private static BiQuadFilter[] CreateFilters(int sampleRate)
        {
            return
            [
                BiQuadFilter.PeakingEQ(sampleRate, 20.6f, 0.5f, -20.0f),
                BiQuadFilter.PeakingEQ(sampleRate, 107.7f, 0.5f, 2.0f),
                BiQuadFilter.PeakingEQ(sampleRate, 737.9f, 0.5f, 0.0f),
                BiQuadFilter.PeakingEQ(sampleRate, 12200.0f, 0.5f, -12.0f)
            ];
        }

        public int Read(float[] buffer, int offset, int count)
        {
            var samplesRead = _source.Read(buffer, offset, count);
            for (var i = 0; i < samplesRead; i += _source.WaveFormat.Channels)
            {
                var sampleLeft = buffer[offset + i];
                foreach (var filter in _filtersLeft)
                {
                    sampleLeft = filter.Transform(sampleLeft);
                }
                buffer[offset + i] = sampleLeft;

                if (_source.WaveFormat.Channels == 2)
                {
                    var sampleRight = buffer[offset + i + 1];
                    foreach (var filter in _filtersRight!)
                    {
                        sampleRight = filter.Transform(sampleRight);
                    }
                    buffer[offset + i + 1] = sampleRight;
                }
            }
            return samplesRead;
        }

        public WaveFormat WaveFormat => _source.WaveFormat;
    }
}