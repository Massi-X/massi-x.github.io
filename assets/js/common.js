//Animate bubbles
document.querySelectorAll('.bubble').forEach(function(elem) {
    var inner = elem.children[0];
    var counter = 0;
    var updateRate = 10;

    var isTimeToUpdate = function() {
        return counter++ % updateRate === 0;
    };
    
    var update = function(event) {
        mouse.updatePosition(event);
        updateTransformStyle(
            (mouse.y / inner.offsetHeight/2).toFixed(2),
            (mouse.x / inner.offsetWidth/2).toFixed(2)
        );
    };

    var updateTransformStyle = function(x, y) {
        var style = "rotateX(" + x + "deg) rotateY(" + y + "deg)";
        inner.style.transform = style;
        inner.style.webkitTransform = style;
        inner.style.mozTransform = style;
        inner.style.msTransform = style;
        inner.style.oTransform = style;
    };

    var mouse = {
        _x: 0,
        _y: 0,
        x: 0,
        y: 0,
        updatePosition: function(event) {
        var e = event || window.event;
        this.x = e.clientX - this._x;
        this.y = (e.clientY - this._y) * -1;
        },
        setOrigin: function(e) {
        this._x = e.offsetLeft + Math.floor(e.offsetWidth/2);
        this._y = e.offsetTop + Math.floor(e.offsetHeight/2);
        },
        show: function() { return '(' + this.x + ', ' + this.y + ')'; }
    }

    // Track the mouse position relative to the center of the container.
    mouse.setOrigin(elem);
    
    elem.addEventListener("mouseenter", e => {
        update(e);
    });
    elem.addEventListener("mouseleave", e => {
        inner.style = "";
    });
    elem.addEventListener("mousemove", e => {
        if (isTimeToUpdate())
            update(e);
    });
});