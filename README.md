# YouTube Subscriptions Manager Extension

Firefox extension that allows you to manage YouTube subscriptions directly from the browser and automatically open new videos.

## Main Features

- Search bar to instantly filter subscriptions (channels and playlists).
- Add a subscription from the extension by simply entering the channel name (without `@`), or from a YouTube page via the `Subscribe` button.
- Remove a subscription or reverse the playback order for playlists.
- Check for updates manually or automatically when the `https://www.youtube.com/` page is visited and opens each new video in a new tab.
- Displays the number of newly opened videos on the icon's red badge (reset after opening).
- Clicking on a name in the list directly opens the channel or playlist, with a relative indication of the last published video.
- Replaces YouTube's `Subscribe` button (search, channel, video) to add the channel to the extension and displays `Subscribed` when already followed.

## Notes

- The extension stores subscriptions in `browser.storage.local`; they are not shared with the Python script's `youtube.json` file.
- Subscription tracking is based on public feeds `https://www.youtube.com/feeds/videos.xml`.
- The `@channel` handle is automatically resolved to retrieve the channel identifier.
