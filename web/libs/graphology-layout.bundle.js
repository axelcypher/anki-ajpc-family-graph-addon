(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
window.GraphologyLayout = require('graphology-layout');
window.GraphologyLayoutCirclePack = require('graphology-layout/circlepack');

},{"graphology-layout":4,"graphology-layout/circlepack":2}],2:[function(require,module,exports){
/**
 * Graphology CirclePack Layout
 * =============================
 *
 * Circlepack layout from d3-hierarchy/gephi.
 */
var resolveDefaults = require('graphology-utils/defaults');
var isGraph = require('graphology-utils/is-graph');
var shuffle = require('pandemonium/shuffle-in-place');

/**
 * Default options.
 */
var DEFAULTS = {
  attributes: {
    x: 'x',
    y: 'y'
  },
  center: 0,
  hierarchyAttributes: [],
  rng: Math.random,
  scale: 1
};

/**
 * Helpers.
 */
function CircleWrap(id, x, y, r, circleWrap) {
  this.wrappedCircle = circleWrap || null; //hacky d3 reference thing

  this.children = {};
  this.countChildren = 0;
  this.id = id || null;
  this.next = null;
  this.previous = null;

  this.x = x || null;
  this.y = y || null;
  if (circleWrap) this.r = 1010101;
  // for debugging purposes - should not be used in this case
  else this.r = r || 999;
}

CircleWrap.prototype.hasChildren = function () {
  return this.countChildren > 0;
};

CircleWrap.prototype.addChild = function (id, child) {
  this.children[id] = child;
  ++this.countChildren;
};

CircleWrap.prototype.getChild = function (id) {
  if (!this.children.hasOwnProperty(id)) {
    var circleWrap = new CircleWrap();
    this.children[id] = circleWrap;
    ++this.countChildren;
  }
  return this.children[id];
};

CircleWrap.prototype.applyPositionToChildren = function () {
  if (this.hasChildren()) {
    var root = this; // using 'this' in Object.keys.forEach seems a bad idea
    for (var key in root.children) {
      var child = root.children[key];
      child.x += root.x;
      child.y += root.y;
      child.applyPositionToChildren();
    }
  }
};

function setNode(/*Graph*/ graph, /*CircleWrap*/ parentCircle, /*Map*/ posMap) {
  for (var key in parentCircle.children) {
    var circle = parentCircle.children[key];
    if (circle.hasChildren()) {
      setNode(graph, circle, posMap);
    } else {
      posMap[circle.id] = {x: circle.x, y: circle.y};
    }
  }
}

function enclosesNot(/*CircleWrap*/ a, /*CircleWrap*/ b) {
  var dr = a.r - b.r;
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return dr < 0 || dr * dr < dx * dx + dy * dy;
}

function enclosesWeak(/*CircleWrap*/ a, /*CircleWrap*/ b) {
  var dr = a.r - b.r + 1e-6;
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  return dr > 0 && dr * dr > dx * dx + dy * dy;
}

function enclosesWeakAll(/*CircleWrap*/ a, /*Array<CircleWrap>*/ B) {
  for (var i = 0; i < B.length; ++i) {
    if (!enclosesWeak(a, B[i])) {
      return false;
    }
  }
  return true;
}

function encloseBasis1(/*CircleWrap*/ a) {
  return new CircleWrap(null, a.x, a.y, a.r);
}

function encloseBasis2(/*CircleWrap*/ a, /*CircleWrap*/ b) {
  var x1 = a.x,
    y1 = a.y,
    r1 = a.r,
    x2 = b.x,
    y2 = b.y,
    r2 = b.r,
    x21 = x2 - x1,
    y21 = y2 - y1,
    r21 = r2 - r1,
    l = Math.sqrt(x21 * x21 + y21 * y21);
  return new CircleWrap(
    null,
    (x1 + x2 + (x21 / l) * r21) / 2,
    (y1 + y2 + (y21 / l) * r21) / 2,
    (l + r1 + r2) / 2
  );
}

function encloseBasis3(/*CircleWrap*/ a, /*CircleWrap*/ b, /*CircleWrap*/ c) {
  var x1 = a.x,
    y1 = a.y,
    r1 = a.r,
    x2 = b.x,
    y2 = b.y,
    r2 = b.r,
    x3 = c.x,
    y3 = c.y,
    r3 = c.r,
    a2 = x1 - x2,
    a3 = x1 - x3,
    b2 = y1 - y2,
    b3 = y1 - y3,
    c2 = r2 - r1,
    c3 = r3 - r1,
    d1 = x1 * x1 + y1 * y1 - r1 * r1,
    d2 = d1 - x2 * x2 - y2 * y2 + r2 * r2,
    d3 = d1 - x3 * x3 - y3 * y3 + r3 * r3,
    ab = a3 * b2 - a2 * b3,
    xa = (b2 * d3 - b3 * d2) / (ab * 2) - x1,
    xb = (b3 * c2 - b2 * c3) / ab,
    ya = (a3 * d2 - a2 * d3) / (ab * 2) - y1,
    yb = (a2 * c3 - a3 * c2) / ab,
    A = xb * xb + yb * yb - 1,
    B = 2 * (r1 + xa * xb + ya * yb),
    C = xa * xa + ya * ya - r1 * r1,
    r = -(A ? (B + Math.sqrt(B * B - 4 * A * C)) / (2 * A) : C / B);
  return new CircleWrap(null, x1 + xa + xb * r, y1 + ya + yb * r, r);
}

function encloseBasis(/*Array<CircleWrap>*/ B) {
  switch (B.length) {
    case 1:
      return encloseBasis1(B[0]);
    case 2:
      return encloseBasis2(B[0], B[1]);
    case 3:
      return encloseBasis3(B[0], B[1], B[2]);
    default:
      throw new Error(
        'graphology-layout/circlepack: Invalid basis length ' + B.length
      );
  }
}

function extendBasis(/*Array<CircleWrap>*/ B, /*CircleWrap*/ p) {
  var i, j;

  if (enclosesWeakAll(p, B)) return [p];

  // If we get here then B must have at least one element.
  for (i = 0; i < B.length; ++i) {
    if (enclosesNot(p, B[i]) && enclosesWeakAll(encloseBasis2(B[i], p), B)) {
      return [B[i], p];
    }
  }

  // If we get here then B must have at least two elements.
  for (i = 0; i < B.length - 1; ++i) {
    for (j = i + 1; j < B.length; ++j) {
      if (
        enclosesNot(encloseBasis2(B[i], B[j]), p) &&
        enclosesNot(encloseBasis2(B[i], p), B[j]) &&
        enclosesNot(encloseBasis2(B[j], p), B[i]) &&
        enclosesWeakAll(encloseBasis3(B[i], B[j], p), B)
      ) {
        return [B[i], B[j], p];
      }
    }
  }

  // If we get here then something is very wrong.
  throw new Error('graphology-layout/circlepack: extendBasis failure !');
}

function score(/*CircleWrap*/ node) {
  var a = node.wrappedCircle;
  var b = node.next.wrappedCircle;
  var ab = a.r + b.r;
  var dx = (a.x * b.r + b.x * a.r) / ab;
  var dy = (a.y * b.r + b.y * a.r) / ab;
  return dx * dx + dy * dy;
}

function enclose(circles, shuffleFunc) {
  var i = 0;
  var circlesLoc = circles.slice();

  var n = circles.length;
  var B = [];
  var p;
  var e;
  shuffleFunc(circlesLoc);
  while (i < n) {
    p = circlesLoc[i];
    if (e && enclosesWeak(e, p)) {
      ++i;
    } else {
      B = extendBasis(B, p);
      e = encloseBasis(B);
      i = 0;
    }
  }
  return e;
}

function place(/*CircleWrap*/ b, /*CircleWrap*/ a, /*CircleWrap*/ c) {
  var dx = b.x - a.x,
    x,
    a2,
    dy = b.y - a.y,
    y,
    b2,
    d2 = dx * dx + dy * dy;
  if (d2) {
    a2 = a.r + c.r;
    a2 *= a2;
    b2 = b.r + c.r;
    b2 *= b2;
    if (a2 > b2) {
      x = (d2 + b2 - a2) / (2 * d2);
      y = Math.sqrt(Math.max(0, b2 / d2 - x * x));
      c.x = b.x - x * dx - y * dy;
      c.y = b.y - x * dy + y * dx;
    } else {
      x = (d2 + a2 - b2) / (2 * d2);
      y = Math.sqrt(Math.max(0, a2 / d2 - x * x));
      c.x = a.x + x * dx - y * dy;
      c.y = a.y + x * dy + y * dx;
    }
  } else {
    c.x = a.x + c.r;
    c.y = a.y;
  }
}

function intersects(/*CircleWrap*/ a, /*CircleWrap*/ b) {
  var dr = a.r + b.r - 1e-6,
    dx = b.x - a.x,
    dy = b.y - a.y;
  return dr > 0 && dr * dr > dx * dx + dy * dy;
}

function packEnclose(/*Array<CircleWrap>*/ circles, shuffleFunc) {
  var n = circles.length;
  if (n === 0) return 0;

  var a, b, c, aa, ca, i, j, k, sj, sk;

  // Place the first circle.
  a = circles[0];
  a.x = 0;
  a.y = 0;
  if (n <= 1) return a.r;

  // Place the second circle.
  b = circles[1];
  a.x = -b.r;
  b.x = a.r;
  b.y = 0;
  if (n <= 2) return a.r + b.r;

  // Place the third circle.
  c = circles[2];
  place(b, a, c);

  // Initialize the front-chain using the first three circles a, b and c.
  a = new CircleWrap(null, null, null, null, a);
  b = new CircleWrap(null, null, null, null, b);
  c = new CircleWrap(null, null, null, null, c);
  a.next = c.previous = b;
  b.next = a.previous = c;
  c.next = b.previous = a;

  // Attempt to place each remaining circle…
  pack: for (i = 3; i < n; ++i) {
    c = circles[i];
    place(a.wrappedCircle, b.wrappedCircle, c);
    c = new CircleWrap(null, null, null, null, c);

    // Find the closest intersecting circle on the front-chain, if any.
    // “Closeness” is determined by linear distance along the front-chain.
    // “Ahead” or “behind” is likewise determined by linear distance.
    j = b.next;
    k = a.previous;
    sj = b.wrappedCircle.r;
    sk = a.wrappedCircle.r;
    do {
      if (sj <= sk) {
        if (intersects(j.wrappedCircle, c.wrappedCircle)) {
          b = j;
          a.next = b;
          b.previous = a;
          --i;
          continue pack;
        }
        sj += j.wrappedCircle.r;
        j = j.next;
      } else {
        if (intersects(k.wrappedCircle, c.wrappedCircle)) {
          a = k;
          a.next = b;
          b.previous = a;
          --i;
          continue pack;
        }
        sk += k.wrappedCircle.r;
        k = k.previous;
      }
    } while (j !== k.next);

    // Success! Insert the new circle c between a and b.
    c.previous = a;
    c.next = b;
    a.next = b.previous = b = c;

    // Compute the new closest circle pair to the centroid.
    aa = score(a);
    while ((c = c.next) !== b) {
      if ((ca = score(c)) < aa) {
        a = c;
        aa = ca;
      }
    }
    b = a.next;
  }

  // Compute the enclosing circle of the front chain.
  a = [b.wrappedCircle];
  c = b;
  var safety = 10000;
  while ((c = c.next) !== b) {
    if (--safety === 0) {
      break;
    }
    a.push(c.wrappedCircle);
  }
  c = enclose(a, shuffleFunc);

  // Translate the circles to put the enclosing circle around the origin.
  for (i = 0; i < n; ++i) {
    a = circles[i];
    a.x -= c.x;
    a.y -= c.y;
  }
  return c.r;
}

function packHierarchy(/*CircleWrap*/ parentCircle, shuffleFunc) {
  var r = 0;
  if (parentCircle.hasChildren()) {
    //pack the children first because the radius is determined by how the children get packed (recursive)
    for (var key in parentCircle.children) {
      var circle = parentCircle.children[key];
      if (circle.hasChildren()) {
        circle.r = packHierarchy(circle, shuffleFunc);
      }
    }
    //now that each circle has a radius set by its children, pack the circles at this level
    r = packEnclose(Object.values(parentCircle.children), shuffleFunc);
  }
  return r;
}

function packHierarchyAndShift(/*CircleWrap*/ parentCircle, shuffleFunc) {
  packHierarchy(parentCircle, shuffleFunc);
  for (var key in parentCircle.children) {
    var circle = parentCircle.children[key];
    circle.applyPositionToChildren();
  }
}

/**
 * Abstract function running the layout.
 *
 * @param  {Graph}    graph                   - Target  graph.
 * @param  {object}   [options]               - Options:
 * @param  {object}     [attributes]          - Attributes names to map.
 * @param  {number}     [center]              - Center of the layout.
 * @param  {string[]}   [hierarchyAttributes] - List of attributes used for the layout in decreasing order.
 * @param  {function}   [rng]                 - Custom RNG function to be used.
 * @param  {number}     [scale]               - Scale of the layout.
 * @return {object}                           - The positions by node.
 */
function genericCirclePackLayout(assign, graph, options) {
  if (!isGraph(graph))
    throw new Error(
      'graphology-layout/circlepack: the given graph is not a valid graphology instance.'
    );

  options = resolveDefaults(options, DEFAULTS);

  var posMap = {},
    positions = {},
    nodes = graph.nodes(),
    center = options.center,
    hierarchyAttributes = options.hierarchyAttributes,
    shuffleFunc = shuffle.createShuffleInPlace(options.rng),
    scale = options.scale;

  var container = new CircleWrap();

  graph.forEachNode(function (key, attributes) {
    var r = attributes.size ? attributes.size : 1;
    var newCircleWrap = new CircleWrap(key, null, null, r);
    var parentContainer = container;

    hierarchyAttributes.forEach(function (v) {
      var attr = attributes[v];
      parentContainer = parentContainer.getChild(attr);
    });

    parentContainer.addChild(key, newCircleWrap);
  });
  packHierarchyAndShift(container, shuffleFunc);
  setNode(graph, container, posMap);
  var l = nodes.length,
    x,
    y,
    i;
  for (i = 0; i < l; i++) {
    var node = nodes[i];

    x = center + scale * posMap[node].x;
    y = center + scale * posMap[node].y;

    positions[node] = {
      x: x,
      y: y
    };

    if (assign) {
      graph.setNodeAttribute(node, options.attributes.x, x);
      graph.setNodeAttribute(node, options.attributes.y, y);
    }
  }
  return positions;
}

var circlePackLayout = genericCirclePackLayout.bind(null, false);
circlePackLayout.assign = genericCirclePackLayout.bind(null, true);

module.exports = circlePackLayout;

},{"graphology-utils/defaults":7,"graphology-utils/is-graph":8,"pandemonium/shuffle-in-place":10}],3:[function(require,module,exports){
/**
 * Graphology Circular Layout
 * ===========================
 *
 * Layout arranging the nodes in a circle.
 */
var resolveDefaults = require('graphology-utils/defaults');
var isGraph = require('graphology-utils/is-graph');

/**
 * Default options.
 */
var DEFAULTS = {
  dimensions: ['x', 'y'],
  center: 0.5,
  scale: 1
};

/**
 * Abstract function running the layout.
 *
 * @param  {Graph}    graph          - Target  graph.
 * @param  {object}   [options]      - Options:
 * @param  {object}     [attributes] - Attributes names to map.
 * @param  {number}     [center]     - Center of the layout.
 * @param  {number}     [scale]      - Scale of the layout.
 * @return {object}                  - The positions by node.
 */
function genericCircularLayout(assign, graph, options) {
  if (!isGraph(graph))
    throw new Error(
      'graphology-layout/random: the given graph is not a valid graphology instance.'
    );

  options = resolveDefaults(options, DEFAULTS);

  var dimensions = options.dimensions;

  if (!Array.isArray(dimensions) || dimensions.length !== 2)
    throw new Error('graphology-layout/random: given dimensions are invalid.');

  var center = options.center;
  var scale = options.scale;
  var tau = Math.PI * 2;

  var offset = (center - 0.5) * scale;
  var l = graph.order;

  var x = dimensions[0];
  var y = dimensions[1];

  function assignPosition(i, target) {
    target[x] = scale * Math.cos((i * tau) / l) + offset;
    target[y] = scale * Math.sin((i * tau) / l) + offset;

    return target;
  }

  var i = 0;

  if (!assign) {
    var positions = {};

    graph.forEachNode(function (node) {
      positions[node] = assignPosition(i++, {});
    });

    return positions;
  }

  graph.updateEachNodeAttributes(
    function (_, attr) {
      assignPosition(i++, attr);
      return attr;
    },
    {
      attributes: dimensions
    }
  );
}

var circularLayout = genericCircularLayout.bind(null, false);
circularLayout.assign = genericCircularLayout.bind(null, true);

module.exports = circularLayout;

},{"graphology-utils/defaults":7,"graphology-utils/is-graph":8}],4:[function(require,module,exports){
/**
 * Graphology Layout
 * ==================
 *
 * Library endpoint.
 */
exports.circlepack = require('./circlepack.js');
exports.circular = require('./circular.js');
exports.random = require('./random.js');
exports.rotation = require('./rotation.js');

},{"./circlepack.js":2,"./circular.js":3,"./random.js":5,"./rotation.js":6}],5:[function(require,module,exports){
/**
 * Graphology Random Layout
 * =========================
 *
 * Simple layout giving uniform random positions to the nodes.
 */
var resolveDefaults = require('graphology-utils/defaults');
var isGraph = require('graphology-utils/is-graph');

/**
 * Default options.
 */
var DEFAULTS = {
  dimensions: ['x', 'y'],
  center: 0.5,
  rng: Math.random,
  scale: 1
};

/**
 * Abstract function running the layout.
 *
 * @param  {Graph}    graph          - Target  graph.
 * @param  {object}   [options]      - Options:
 * @param  {array}      [dimensions] - List of dimensions of the layout.
 * @param  {number}     [center]     - Center of the layout.
 * @param  {function}   [rng]        - Custom RNG function to be used.
 * @param  {number}     [scale]      - Scale of the layout.
 * @return {object}                  - The positions by node.
 */
function genericRandomLayout(assign, graph, options) {
  if (!isGraph(graph))
    throw new Error(
      'graphology-layout/random: the given graph is not a valid graphology instance.'
    );

  options = resolveDefaults(options, DEFAULTS);

  var dimensions = options.dimensions;

  if (!Array.isArray(dimensions) || dimensions.length < 1)
    throw new Error('graphology-layout/random: given dimensions are invalid.');

  var d = dimensions.length;
  var center = options.center;
  var rng = options.rng;
  var scale = options.scale;

  var offset = (center - 0.5) * scale;

  function assignPosition(target) {
    for (var i = 0; i < d; i++) {
      target[dimensions[i]] = rng() * scale + offset;
    }

    return target;
  }

  if (!assign) {
    var positions = {};

    graph.forEachNode(function (node) {
      positions[node] = assignPosition({});
    });

    return positions;
  }

  graph.updateEachNodeAttributes(
    function (_, attr) {
      assignPosition(attr);
      return attr;
    },
    {
      attributes: dimensions
    }
  );
}

var randomLayout = genericRandomLayout.bind(null, false);
randomLayout.assign = genericRandomLayout.bind(null, true);

module.exports = randomLayout;

},{"graphology-utils/defaults":7,"graphology-utils/is-graph":8}],6:[function(require,module,exports){
/**
 * Graphology Rotation Layout Helper
 * ==================================
 *
 * Function rotating the coordinates of the graph.
 */
var resolveDefaults = require('graphology-utils/defaults');
var isGraph = require('graphology-utils/is-graph');

/**
 * Constants.
 */
var RAD_CONVERSION = Math.PI / 180;

/**
 * Default options.
 */
var DEFAULTS = {
  dimensions: ['x', 'y'],
  centeredOnZero: false,
  degrees: false
};

/**
 * Abstract function for rotating a graph's coordinates.
 *
 * @param  {Graph}    graph          - Target  graph.
 * @param  {number}   angle          - Rotation angle.
 * @param  {object}   [options]      - Options.
 * @return {object}                  - The positions by node.
 */
function genericRotation(assign, graph, angle, options) {
  if (!isGraph(graph))
    throw new Error(
      'graphology-layout/rotation: the given graph is not a valid graphology instance.'
    );

  options = resolveDefaults(options, DEFAULTS);

  if (options.degrees) angle *= RAD_CONVERSION;

  var dimensions = options.dimensions;

  if (!Array.isArray(dimensions) || dimensions.length !== 2)
    throw new Error('graphology-layout/random: given dimensions are invalid.');

  // Handling null graph
  if (graph.order === 0) {
    if (assign) return;

    return {};
  }

  var xd = dimensions[0];
  var yd = dimensions[1];

  var xCenter = 0;
  var yCenter = 0;

  if (!options.centeredOnZero) {
    // Finding bounds of the graph
    var xMin = Infinity;
    var xMax = -Infinity;
    var yMin = Infinity;
    var yMax = -Infinity;

    graph.forEachNode(function (node, attr) {
      var x = attr[xd];
      var y = attr[yd];

      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    });

    xCenter = (xMin + xMax) / 2;
    yCenter = (yMin + yMax) / 2;
  }

  var cos = Math.cos(angle);
  var sin = Math.sin(angle);

  function assignPosition(target) {
    var x = target[xd];
    var y = target[yd];

    target[xd] = xCenter + (x - xCenter) * cos - (y - yCenter) * sin;
    target[yd] = yCenter + (x - xCenter) * sin + (y - yCenter) * cos;

    return target;
  }

  if (!assign) {
    var positions = {};

    graph.forEachNode(function (node, attr) {
      var o = {};
      o[xd] = attr[xd];
      o[yd] = attr[yd];
      positions[node] = assignPosition(o);
    });

    return positions;
  }

  graph.updateEachNodeAttributes(
    function (_, attr) {
      assignPosition(attr);
      return attr;
    },
    {
      attributes: dimensions
    }
  );
}

var rotation = genericRotation.bind(null, false);
rotation.assign = genericRotation.bind(null, true);

module.exports = rotation;

},{"graphology-utils/defaults":7,"graphology-utils/is-graph":8}],7:[function(require,module,exports){
/**
 * Graphology Defaults
 * ====================
 *
 * Helper function used throughout the standard lib to resolve defaults.
 */
function isLeaf(o) {
  return (
    !o ||
    typeof o !== 'object' ||
    typeof o === 'function' ||
    Array.isArray(o) ||
    o instanceof Set ||
    o instanceof Map ||
    o instanceof RegExp ||
    o instanceof Date
  );
}

function resolveDefaults(target, defaults) {
  target = target || {};

  var output = {};

  for (var k in defaults) {
    var existing = target[k];
    var def = defaults[k];

    // Recursion
    if (!isLeaf(def)) {
      output[k] = resolveDefaults(existing, def);

      continue;
    }

    // Leaf
    if (existing === undefined) {
      output[k] = def;
    } else {
      output[k] = existing;
    }
  }

  return output;
}

module.exports = resolveDefaults;

},{}],8:[function(require,module,exports){
/**
 * Graphology isGraph
 * ===================
 *
 * Very simple function aiming at ensuring the given variable is a
 * graphology instance.
 */

/**
 * Checking the value is a graphology instance.
 *
 * @param  {any}     value - Target value.
 * @return {boolean}
 */
module.exports = function isGraph(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.addUndirectedEdgeWithKey === 'function' &&
    typeof value.dropNode === 'function' &&
    typeof value.multi === 'boolean'
  );
};

},{}],9:[function(require,module,exports){
/**
 * Pandemonium Random
 * ===================
 *
 * Random function.
 */

/**
 * Creating a function returning a random integer such as a <= N <= b.
 *
 * @param  {function} rng - RNG function returning uniform random.
 * @return {function}     - The created function.
 */
function createRandom(rng) {
  /**
   * Random function.
   *
   * @param  {number} a - From.
   * @param  {number} b - To.
   * @return {number}
   */
  return function (a, b) {
    return a + Math.floor(rng() * (b - a + 1));
  };
}

/**
 * Default random using `Math.random`.
 */
var random = createRandom(Math.random);

/**
 * Exporting.
 */
random.createRandom = createRandom;
module.exports = random;

},{}],10:[function(require,module,exports){
/**
 * Pandemonium Shuffle In Place
 * =============================
 *
 * Shuffle function applying the Fisher-Yates algorithm to the provided array.
 */
var createRandom = require('./random.js').createRandom;

/**
 * Creating a function returning the given array shuffled.
 *
 * @param  {function} rng - The RNG to use.
 * @return {function}     - The created function.
 */
function createShuffleInPlace(rng) {
  var customRandom = createRandom(rng);

  /**
   * Function returning the shuffled array.
   *
   * @param  {array}  sequence - Target sequence.
   * @return {array}           - The shuffled sequence.
   */
  return function (sequence) {
    var length = sequence.length,
      lastIndex = length - 1;

    var index = -1;

    while (++index < length) {
      var r = customRandom(index, lastIndex),
        value = sequence[r];

      sequence[r] = sequence[index];
      sequence[index] = value;
    }
  };
}

/**
 * Default shuffle in place using `Math.random`.
 */
var shuffleInPlace = createShuffleInPlace(Math.random);

/**
 * Exporting.
 */
shuffleInPlace.createShuffleInPlace = createShuffleInPlace;
module.exports = shuffleInPlace;

},{"./random.js":9}]},{},[1]);
