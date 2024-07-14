using NAudio.Dsp;
using NAudio.Wave;

namespace Spector.Model;

public class AudioLevelMeter : IDisposable  
{
    private readonly BufferedWaveProvider _bufferedWaveProvider;
    private readonly AWeightingFilter _filter;
    private readonly int _bytesPerSample;
    private readonly int _channelCount;

    public WaveFormat WaveFormat => _bufferedWaveProvider.WaveFormat;

    public AudioLevelMeter(WaveFormat waveFormat)
    {
        _bytesPerSample = waveFormat.BitsPerSample / 8;
        _channelCount = waveFormat.Channels;
        _bufferedWaveProvider = new BufferedWaveProvider(waveFormat);
        _filter = new AWeightingFilter(_bufferedWaveProvider.ToSampleProvider());
    }

    public Decibel CalculateLevel(byte[] buffer, int bytesRecorded)
    {
        _bufferedWaveProvider.AddSamples(buffer, 0, bytesRecorded);

        var samplesPerChannel = bytesRecorded / (_bytesPerSample * _channelCount);
        var floatBuffer = new float[samplesPerChannel * _channelCount];

        ConvertToFloat(buffer, floatBuffer, bytesRecorded);

        var samplesRead = _filter.Read(floatBuffer, 0, floatBuffer.Length);

        double sumSquares = 0;
        for (var i = 0; i < samplesRead; i++)
        {
            sumSquares += floatBuffer[i] * floatBuffer[i];
        }

        var rms = Math.Sqrt(sumSquares / samplesRead);
        var db = 20 * Math.Log10(rms);
        var level = (Decibel)db;

        return Decibel.Minimum <= level ? level : Decibel.Minimum;
    }

    private void ConvertToFloat(byte[] input, float[] output, int bytesRecorded)
    {
        int outputIndex = 0;

        for (int inputIndex = 0; inputIndex < bytesRecorded; inputIndex += _bytesPerSample)
        {
            float sample = 0;

            switch (_bytesPerSample)
            {
                case 1: // 8-bit PCM
                    sample = (input[inputIndex] - 128) / 128f;
                    break;
                case 2: // 16-bit PCM
                    sample = BitConverter.ToInt16(input, inputIndex) / 32768f;
                    break;
                case 3: // 24-bit PCM
                    int sample24 = (input[inputIndex + 2] << 16) | (input[inputIndex + 1] << 8) | input[inputIndex];
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

    public void Dispose()
    {
        _bufferedWaveProvider.ClearBuffer();
    }

    private class AWeightingFilter(ISampleProvider source) : ISampleProvider
    {
        private readonly BiQuadFilter[] _filters = CreateFilters(source.WaveFormat.SampleRate);

        private static BiQuadFilter[] CreateFilters(int sampleRate)
        {
            return new BiQuadFilter[]
            {
                BiQuadFilter.PeakingEQ(sampleRate, 20.6f, 0.5f, -20.0f),
                BiQuadFilter.PeakingEQ(sampleRate, 107.7f, 0.5f, 2.0f),
                BiQuadFilter.PeakingEQ(sampleRate, 737.9f, 0.5f, 0.0f),
                BiQuadFilter.PeakingEQ(sampleRate, 12200.0f, 0.5f, -12.0f)
            };
        }

        public int Read(float[] buffer, int offset, int count)
        {
            var samplesRead = source.Read(buffer, offset, count);
            for (var i = 0; i < samplesRead; i++)
            {
                var sample = buffer[offset + i];
                foreach (var filter in _filters)
                {
                    sample = filter.Transform(sample);
                }
                buffer[offset + i] = sample;
            }
            return samplesRead;
        }

        public WaveFormat WaveFormat => source.WaveFormat;
    }
}