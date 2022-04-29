import MakerJs, { angle, IModelMap, IPathMap, IPoint, path, paths } from "makerjs";
import * as fs from "fs";
import * as math from "./math";
import { pi } from "mathjs";

var debug_circle: MakerJs.IModel = {};

export function modelToInvoluteGear(
    model: MakerJs.IModel,
    pressure_angle: number,
    tooth_width: number,
    tooth_height: number,
    offset: number,
    slop: number,
    loop: boolean,
    involute_precision: number = 100,
): IModelMap {

    // Our cycloid for rolling
    var tooth_prec_width = tooth_width / involute_precision;

    // Setting up the chain we'll walk along
    var chain = MakerJs.model.findSingleChain(model);
    var start = Math.floor(offset / tooth_prec_width);
    var chain_points = MakerJs.chain.toPoints(chain, tooth_prec_width);
    var num_points = chain_points.length;

    // Getting a circle to walk along when we go off either end
    var circle_start = math.circleFromThreePoints(chain_points[0], chain_points[1], chain_points[2]);
    var circle_end = math.circleFromThreePoints(chain_points[num_points - 1], chain_points[num_points - 2], chain_points[num_points - 3]);

    // Now we need the angle cooresponding to a step of step_width on either circle
    var start_r = math.dist(circle_start, chain_points[0]);
    var start_step_angle = tooth_prec_width / start_r;

    var end_r = math.dist(circle_end, chain_points[num_points - 1]);
    var end_step_angle = tooth_prec_width / end_r;

    // Rotation direction is also important
    var start_dir = math.rotationDir(circle_start, chain_points[1], chain_points[0]);
    var start_ang = math.circle_angle(circle_start, chain_points[0]);

    var end_dir = math.rotationDir(circle_end, chain_points[num_points - 2], chain_points[num_points - 1]);
    var end_ang = math.circle_angle(circle_end, chain_points[num_points - 1]);

    // Functions to wrap getting a point
    function getPoint(a: number): IPoint {
        if (a < 0) {
            var angle = start_ang + (start_step_angle * start_dir * -1.0 * a);
            return math.circlePoint(circle_start, start_r, angle);
        } else if (a >= num_points) {
            var angle = end_ang + (end_step_angle * end_dir * (a - num_points + 1.0));
            return math.circlePoint(circle_end, end_r, angle);
        } else {
            return chain_points[a];
        }
    }

    var involutes = [];

    // Now we walk along the chain
    var dir = 1;

    // Projection method

    for (var i = start; i < num_points; i += involute_precision) {

        var n_tooth = i - dir * slop;
        var tmp_row = []
        var start_point = getPoint(n_tooth);

        // Measurement vector
        var prev_point = getPoint(n_tooth - dir);
        var next_point = getPoint(n_tooth + dir);
        var measure_vec = math.slope(prev_point, next_point);
        if (dir < 0) {
            measure_vec = math.rotNintyCntClock(measure_vec);
        } else {
            measure_vec = math.rotNintyClock(measure_vec);
        }

        var measure_mag = tooth_height/math.magnitude(measure_vec);
        var measure_point = math.applyVectorMul(start_point, measure_mag, measure_vec);

        var angle_init_b = math.circle_angle([0,0], measure_vec) - dir * pressure_angle;
        var angle_init_a = Math.PI + angle_init_b;

        // Loop variables
        var j = n_tooth;
        var j_in = n_tooth;
        var dist = 0;

        // Let's walk the walk
        while (true) {
            
            j += dir;
            j_in -= dir;
            dist += tooth_prec_width;

            // Get a point back to the tooth edge
            var point_a = getPoint(j);
            var angle_a = Math.PI/2.0 - math.dot_a(start_point, point_a, measure_point);
            var angle_proj_a = angle_init_a + dir * (angle_a);
            var new_point = math.circlePoint(start_point, dist, angle_proj_a);

            // Get a point back to the tooth edge
            var point_b = getPoint(j_in);
            var angle_b =  Math.PI/2.0 - math.dot_a(start_point, point_b, measure_point);
            var angle_proj_b = angle_init_b - dir * (angle_b);
            var new_point_in = math.circlePoint(start_point, dist, angle_proj_b);

            // project the new point onto the measurement vectpr
            var proj = math.project(math.slope(start_point, new_point), measure_vec);
            if (math.magnitude(proj) > tooth_height) {
                break;
            }

            tmp_row.push(new_point);
            tmp_row.unshift(new_point_in);
        }

        if (dir < 0) {
            for (var j = 0; j < tmp_row.length; j++) {
                involutes.push(tmp_row[j]);
            }
        } else {
            for (var j = tmp_row.length - 1; j >= 0; j--) {
                involutes.push(tmp_row[j]);
            }
        }

        dir = -dir;
    }

    return {
        origins: { layer: "brown", ...new MakerJs.models.ConnectTheDots(loop, involutes) }
    };
}


var radius = 500;

var bezier_points: IPoint[] = [
    [-radius, -radius],
    [-0.75 * radius, radius],
    [0.75 * radius, -radius],
    [radius, radius]
];
// var bezier = new MakerJs.models.BezierCurve(bezier_points);
var bezier = new MakerJs.models.Ellipse(radius, radius);
var model_bez = MakerJs.model.rotate(MakerJs.model.mirror(bezier, false, false), 270);

// var tooth_width = radius * 2.0 * Math.PI / 40;
var tooth_height = 80;
var tooth_width = (2.0 * Math.PI * radius)/20

var teeth_model = modelToInvoluteGear(
    model_bez,
    2.0 * (Math.PI/18),
    tooth_width,
    tooth_height,
    0,
    40,
    false,
    1000,
);

var crosshair = new MakerJs.models.Holes(5, [[0,0]]);

var model = {
    models: {
        model_bez: { layer: "red", ...model_bez },
        circle: { layer: "blue", ...debug_circle },
        crosshair: crosshair,
        ...teeth_model
    }
};

var renderOptions: MakerJs.exporter.ISVGRenderOptions = {
    strokeWidth: "1mm",
    units: MakerJs.unitType.Millimeter
};

var svg = MakerJs.exporter.toSVG(model, renderOptions);

fs.writeFile("test.svg", svg, _ => { });