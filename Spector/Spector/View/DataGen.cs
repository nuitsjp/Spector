namespace Spector.View;

public static class DataGen
{

    public class Electrocardiogram
    {
        /*
         * The aim of the ECG simulator is to produce the typical ECG waveforms of different leads and
         * as many arrhythmias as possible. My ECG simulator is able To produce normal lead II ECG
         * waveform. The use Of a simulator has many advantages In the simulation Of ECG waveforms.
         * First one Is saving Of time And another one Is removing the difficulties Of taking real ECG
         * signals With invasive And noninvasive methods. The ECG simulator enables us To analyze And
         * study normal And abnormal ECG waveforms without actually Using the ECG machine. One can
         * simulate any given ECG waveform Using the ECG simulator. The way by which my simulator
         * differs from other typical ECG simulators Is that i have used the principle Of Fourier
         * series. The calculations used And other necessary descriptions are included In the file
         * attached.
         * 
         * https://www.mathworks.com/matlabcentral/fileexchange/10858-ecg-simulation-using-matlab
         * (c) 2019 karthik raviprakash. All rights reserved. MIT license.
         */

        public double PWaveAmplitude { get; set; } = 0.25d;
        public double PWaveDuration { get; set; } = 0.09d;
        public double PWavePRInterval { get; set; } = 0.16d;
        public double QWaveAmplitude { get; set; } = 0.025d;
        public double QwaveDuration { get; set; } = 0.066d;
        public double QWaveTime { get; set; } = 0.166d;
        public double QRSWaveAmplitude { get; set; } = 1.6d;
        public double QRSwaveDuration { get; set; } = 0.11d;
        public double SWaveAmplitude { get; set; } = 0.25d;
        public double SWaveDuration { get; set; } = 0.066d;
        public double SWaveTime { get; set; } = 0.09d;
        public double TWaveAmplitude { get; set; } = 0.35d;
        public double TWaveDuration { get; set; } = 0.142d;
        public double TWaveSTInterval { get; set; } = 0.2d;
        public double UWaveAmplitude { get; set; } = 0.035d;
        public double UWaveDuration { get; set; } = 0.0476d;
        public double UWaveTime { get; set; } = 0.433d;

        private double _HeartRate;
        public double HeartRate { get => _HeartRate; set => (_HeartRate, _Period) = (value, 60d / value); }

        private double _Period;
        public double Period { get => _Period; set => (_Period, _HeartRate) = (value, 60d / value); }

        public Electrocardiogram(double heartRate = 72) => HeartRate = heartRate;

        public double GetVoltage(double elapsedSeconds)
        {
            elapsedSeconds %= (2d * Period);
            double value = -0.9d;
            value += PWave(elapsedSeconds, PWaveAmplitude, PWaveDuration, PWavePRInterval, Period);
            value += QWave(elapsedSeconds, QWaveAmplitude, QwaveDuration, QWaveTime, Period);
            value += QRSwave(elapsedSeconds, QRSWaveAmplitude, QRSwaveDuration, Period);
            value += SWave(elapsedSeconds, SWaveAmplitude, SWaveDuration, SWaveTime, Period);
            value += TWave(elapsedSeconds, TWaveAmplitude, TWaveDuration, TWaveSTInterval, Period);
            value += UWave(elapsedSeconds, UWaveAmplitude, UWaveDuration, UWaveTime, Period);
            return value;
        }

        private static double QRSwave(double x, double amplitude, double duration, double period)
        {
            double l = 0.5d * period;
            double a = amplitude;
            double b = 2d * l / duration;
            int n = 100;
            double qrs1 = a / (2d * b) * (2d - b);
            double qrs2 = 0d;
            for (int i = 1, loopTo = n; i <= loopTo; i++)
            {
                double harm = 2d * b * a / (i * i * Math.PI * Math.PI) * (1d - Math.Cos(i * Math.PI / b)) * Math.Cos(i * Math.PI * x / l);
                qrs2 += harm;
            }

            return qrs1 + qrs2;
        }

        private static double PWave(double x, double amplitude, double duration, double time, double period)
        {
            double l = 0.5d * period;
            double a = amplitude;
            double b = 2d * l / duration;
            x += time;
            int n = 100;
            double p1 = 1d / l;
            double p2 = 0d;
            double harm1;
            for (int i = 1, loopTo = n; i <= loopTo; i++)
            {
                harm1 = (Math.Sin(Math.PI / (2d * b) * (b - 2 * i)) / (b - 2 * i) + Math.Sin(Math.PI / (2d * b) * (b + 2 * i)) / (b + 2 * i)) * (2d / Math.PI) * Math.Cos(i * Math.PI * x / l);
                p2 += harm1;
            }

            return a * (p1 + p2);
        }

        private static double QWave(double x, double amplitude, double duration, double time, double period)
        {
            double l = 0.5d * period;
            double a = amplitude;
            double b = 2d * l / duration;
            x += time;
            int n = 100;
            double q1 = a / (2d * b) * (2d - b);
            double q2 = 0d;
            double harm5;
            for (int i = 1, loopTo = n; i <= loopTo; i++)
            {
                harm5 = 2d * b * a / (i * i * Math.PI * Math.PI) * (1d - Math.Cos(i * Math.PI / b)) * Math.Cos(i * Math.PI * x / l);
                q2 += harm5;
            }

            return -1 * (q1 + q2);
        }

        private static double SWave(double x, double amplitude, double duration, double time, double period)
        {
            double l = 0.5d * period;
            double a = amplitude;
            double b = 2d * l / duration;
            x -= time;
            int n = 100;
            double s1 = a / (2d * b) * (2d - b);
            double s2 = 0d;
            double harm3;
            for (int i = 1, loopTo = n; i <= loopTo; i++)
            {
                harm3 = 2d * b * a / (i * i * Math.PI * Math.PI) * (1d - Math.Cos(i * Math.PI / b)) * Math.Cos(i * Math.PI * x / l);
                s2 += harm3;
            }

            return -1 * (s1 + s2);
        }

        private static double TWave(double x, double amplitude, double duration, double time, double period)
        {
            double l = 0.5d * period;
            double a = amplitude;
            double b = 2d * l / duration;
            x = x - time - 0.045d;
            int n = 100;
            double t1 = 1d / l;
            double t2 = 0d;
            double harm2;
            for (int i = 1, loopTo = n; i <= loopTo; i++)
            {
                harm2 = (Math.Sin(Math.PI / (2d * b) * (b - 2 * i)) / (b - 2 * i) + Math.Sin(Math.PI / (2d * b) * (b + 2 * i)) / (b + 2 * i)) * (2d / Math.PI) * Math.Cos(i * Math.PI * x / l);
                t2 += harm2;
            }

            return a * (t1 + t2);
        }

        private static double UWave(double x, double amplitude, double duration, double time, double period)
        {
            double l = 0.5d * period;
            double a = amplitude;
            double b = 2d * l / duration;
            x -= time;
            int n = 100;
            double u1 = 1d / l;
            double u2 = 0d;
            double harm4;
            for (int i = 1, loopTo = n; i <= loopTo; i++)
            {
                harm4 = (Math.Sin(Math.PI / (2d * b) * (b - 2 * i)) / (b - 2 * i) + Math.Sin(Math.PI / (2d * b) * (b + 2 * i)) / (b + 2 * i)) * (2d / Math.PI) * Math.Cos(i * Math.PI * x / l);
                u2 += harm4;
            }

            return a * (u1 + u2);
        }
    }
}
