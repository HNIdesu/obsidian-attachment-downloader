# Attachment Downloader Plugin

A plugin for Obsidian that automatically downloads note attachments via Git LFS.

## Usage

1. Create a Git repository in your note directory.  
   Use **Git LFS** to track the attachment directory.

2. Run the server script:

```bash
   python server.py <note_directory> [--bind-address <address>] [--port <port>]
```

3. Enable this plugin in Obsidian and configure the settings as needed.

4. You can either:

   * Run the **Download All Attachments** command manually, or
   * Let the plugin automatically download attachments when a note is opened.

## License
See [LICENSE](./LICENSE) for license information.
