module.exports = {
    
    /**
     * Extends object with properties from another object(s)
     * Used in object inheritance
     * 
     * @param {Object}
     * @return {Object}
     */
    extend: function(target) {
        var sources = [].slice.call(arguments, 1);
        sources.forEach(function(source) {
            for (var prop in source)
                target[prop] = source[prop];
        });
        return target;
    },
    
    /**
     * Get current timestamp in ISO format
     * @return {string}
     */
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
    
    /**
     * Check if object is undefined
     * @return {bool}
     */
    isNull : function(obj) {
        return (typeof obj == 'undefined' || obj === null);
    }
};