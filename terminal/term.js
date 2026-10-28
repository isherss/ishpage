

$('body').terminal({
    help: function() {
        this.echo('ls | shows files and folder in your current directory');
    },
    ls: function() {
        this.echo('[[b;#13ddd9;]rngdle.exe]');
    }
}, {
    greetings: false,
    onInit() {
            this.echo('Welcome to [[b;#13ddd9;]IshTerm]');
            this.echo('Stuck? try the command [[b;#13ddd9;]help] :3');
        }
});