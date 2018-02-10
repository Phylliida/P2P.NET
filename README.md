# P2P.NET
Peer to peer networking in C# using WebRTC

This technically works, however it has some issues with latency with lots of clients, and the disconnect callback is never called. I've been working on it but am not to a got state yet. Honestly I would recommend using the [WebRTC Network plugin](https://assetstore.unity.com/packages/tools/network/webrtc-network-47846) if you are using Unity, as it does everything my software does and more for free. The author also has [A video and audio chat application](https://assetstore.unity.com/packages/tools/network/webrtc-video-chat-68030) for $95 if you need that as well. I am in no way associated with that author, but his tools are stictly better than mine so I'd recommend using them until mine is in a better place.

This is designed to be pretty easy to use, here is an example:

```C#

class SampleUsage
{
    Peer myPeer;
    public SampleUsage() {
        // See below for how to make your own signaling server if you want
        myPeer = new Peer("ws://sample-bean.herokuapp.com", "anystring this is your room id");
        myPeer.OnBytesFromPeer += Peer_OnBytesFromPeer;
        myPeer.OnConnection += Peer_OnConnection;
        myPeer.OnDisconnection += Peer_OnDisconnection;
        myPeer.OnGetID += Peer_OnGetID;
        myPeer.OnTextFromPeer += Peer_OnTextFromPeer;
    }

    void Peer_OnGetID(string id)
    {
        Console.WriteLine("my id is " + id);
    }

    void Peer_OnConnection(string peer)
    {
        Console.WriteLine(peer + " connected");
        myPeer.Send(peer, "hi there");
        myPeer.Send(peer, new byte[] {1, 27, 28});
    }

    void Peer_OnDisconnection(string peer)
    {
        Console.WriteLine(peer + " disconnected");
    }

    void Peer_OnTextFromPeer(string peer, string text)
    {
        Console.WriteLine(peer + " sent " + text);
    }

    void Peer_OnBytesFromPeer(string peer, byte[] bytes)
    {
        Console.WriteLine(peer + " sent " + bytes.Length + " bytes");
    }

    // Call peer.Dispose() when you are done using it
    void OnClose()
    {
        myPeer.Dispose(); // it is fine to call this more then once
    }
    
    // Call peer.Update() often (every frame is fine). It will call your callbacks on the thread you call Update()
    void Tick ()
    {
        myPeer.Update();
    }
}
  ```
All the work is done on a seperate thread (that is then passed to thread-safe queues that are dequeued when you call `Update()`) so it is all non-blocking.

You can simply use my signaling server for testing. If you want to host your own (for free), you can do the following:

1. Make an account on https://www.heroku.com/. It is free and doesn't even require you to enter payment info
2. Go into https://dashboard.heroku.com and click New, then Create New App.
3. Pick some random app name or let it choose one for you it doesn't really matter because this is just the websocket url that no one will see. Mine is nameless-scrubland-88927 but insert yours into the commands below instead
4. Install the [heroku cli](https://devcenter.heroku.com/articles/heroku-cli), nodejs, and npm
5. Clone this repo

`git clone https://github.com/Phylliida/P2P.NET.git`

then copy the server code (signalingServer) into a directory without the .git file

6. In that directory, to login call

`heroku login`

7. Then create a new git repo there that will store your server code (Heroku works by having a git repo you manage your server code with)

`git init`

`heroku git:remote -a nameless-scrubland-88927`

(except use your server instead)

8. Now deploy your server

`npm install`

`git add .`

`git commit -am "Initial upload"`

`git push -f heroku master`

The -f (force) you shouldn't usually do but we need to override the initial configuration and this is the easiest way to do that.

You can tweak the config.json file if you want but that isn't really needed. You should also generate your own certificates in production but these work fine for testing small projects.

Now in the code above you can replace

```C#
myPeer = new Peer("ws://sample-bean.herokuapp.com", "anystring this is your room id");
```

with

```C#
myPeer = new Peer("ws://nameless-scrubland-88927.herokuapp.com", "anystring this is your room id");
```

except use your server instead :)
