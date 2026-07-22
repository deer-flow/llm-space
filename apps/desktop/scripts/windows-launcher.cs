using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class WindowsLauncher
{
    private const string CoreLauncherName = "launcher-core.exe";

    [STAThread]
    private static int Main(string[] args)
    {
        string directory = AppDomain.CurrentDomain.BaseDirectory;
        string coreLauncher = Path.Combine(directory, CoreLauncherName);
        if (!File.Exists(coreLauncher))
        {
            return 2;
        }

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = coreLauncher,
            Arguments = BuildArguments(args),
            WorkingDirectory = directory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };

        using (Process process = new Process { StartInfo = startInfo })
        {
            process.OutputDataReceived += IgnoreOutput;
            process.ErrorDataReceived += IgnoreOutput;
            if (!process.Start())
            {
                return 3;
            }

            process.StandardInput.Close();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    private static void IgnoreOutput(object sender, DataReceivedEventArgs args)
    {
    }

    private static string BuildArguments(string[] args)
    {
        StringBuilder commandLine = new StringBuilder();
        foreach (string arg in args)
        {
            if (commandLine.Length > 0)
            {
                commandLine.Append(' ');
            }
            commandLine.Append(QuoteArgument(arg));
        }
        return commandLine.ToString();
    }

    // Recreate a Windows command-line argument according to the escaping rules
    // used by CommandLineToArgvW so deep links and file paths survive unchanged.
    private static string QuoteArgument(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '\n', '\v', '"' }) < 0)
        {
            return value;
        }

        StringBuilder quoted = new StringBuilder();
        quoted.Append('"');
        int backslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }

            if (character == '"')
            {
                quoted.Append('\\', backslashes * 2 + 1);
                quoted.Append('"');
                backslashes = 0;
                continue;
            }

            quoted.Append('\\', backslashes);
            backslashes = 0;
            quoted.Append(character);
        }
        quoted.Append('\\', backslashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }
}
