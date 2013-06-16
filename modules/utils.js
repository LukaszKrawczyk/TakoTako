module.exports = {
    extend: function(target) {
        var sources = [].slice.call(arguments, 1);
        sources.forEach(function(source) {
            for (var prop in source)
                target[prop] = source[prop];
        });
        return target;
    },
    getTimestamp: function() {
        return (new Date()).toISOString();
    },
    /**
     * Get random number within range
     *
     * @param {int} min
     * @param {int} max
     * @return {int}
     */
    random : function(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    isNull : function(obj) {
        return (typeof obj == 'undefined' || obj === null);
    }
};