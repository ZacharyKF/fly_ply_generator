import MakerJs, { IPathMap, IPoint, path, paths } from "makerjs";
import * as fs from "fs";
import * as math from "./math";

const TPI = 2.0 * Math.PI;

var number_teeth = 16.0 * 2;
var radius = 500.0;
var spacing = (TPI * radius) / number_teeth;

/**
 * Involute should be the sum of:
 *  - Value at chain point n (origin point of involute)
 *  - -1 * the unit tangent vector at chain point n * the arc length function at chain point n 
 * 
 *  So we want to take a point n, and walk away from it, drawing additional points at unit tangent away from the point 
 *      we've walked away to
 * 
 * @param model 
 * @param toothWidth 
 * @param toothHeight 
 * @returns 
 */
export function modelToInvoluteGear(
    model: MakerJs.IModel,
    toothWidth: number,
    toothHeight: number,
    loop: boolean,
    slop: number
): MakerJs.IModel {

    // Integer that adds steps to the involute chain to increase precision
    var involute_precision = 100.0;

    // Setting up the chain we'll walk along
    var chain = MakerJs.model.findSingleChain(model);
    var tooth_prec_width = toothWidth / involute_precision;
    var chain_points = MakerJs.chain.toPoints(chain, tooth_prec_width);
    var num_points = chain_points.length;
    var angle_step = Math.atan2(tooth_prec_width, toothHeight);
    var scale_factor = toothWidth / toothHeight;

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
        if(loop) {
            return chain_points[(a + num_points) %num_points]
        }
        if (a < 0) {
            var angle = start_ang + (start_step_angle * a);
            var angle_vec = [start_r * Math.cos(angle), start_r * Math.sin(angle)];
            return math.applyVectorMul(circle_start, start_dir, angle_vec);
        } else if (a >= num_points) {
            var angle = end_ang + (end_step_angle * (a - num_points + 1.0));
            var angle_vec = [end_r * Math.cos(angle), end_r * Math.sin(angle)];
            return  math.applyVectorMul(circle_end, end_dir, angle_vec);
        } else {
            return chain_points[a];
        }
    }

    var involute_points = [];

    // Now we walk along the chain
    var dir = 1;

    // Projection method
    for (var i = 0; i < num_points; i += involute_precision) {

        var points = [];

        var origin_point = getPoint(i);
        points.push(origin_point);

        var last_point = getPoint(i - dir);
        var second_last_point = getPoint(i - (2 * dir));

        var angle = math.circle_angle(last_point, origin_point);

        var angle_dir = math.rotationDir(second_last_point, origin_point, last_point);

        for (var j = i; true; j += dir) {

            var action_point = getPoint(j);
            var proj_dist = math.dist(action_point, origin_point);
            proj_dist = proj_dist * scale_factor;

            if (proj_dist > toothHeight) {
                break;
            }

            var proj_vec: IPoint = [Math.cos(angle), Math.sin(angle)];

            if (angle_dir > 0) {
                proj_vec = math.rotNintyClock(proj_vec);
            } else {
                proj_vec = math.rotNintyCntClock(proj_vec);
            }

            // if (i == 0 && !loop){
            //     proj_vec = math.rotNintyCntClock(proj_vec);
            // }

            var proj_u = proj_dist / math.magnitude(proj_vec);

            if (i != j) {
                if (angle_dir <= 0) {
                    points.unshift(math.applyVectorMul(origin_point, proj_u, proj_vec));
                    points.push(math.applyVectorMul(origin_point, -proj_u, proj_vec));
                } else {
                    points.unshift(math.applyVectorMul(origin_point, -proj_u, proj_vec));
                    points.push(math.applyVectorMul(origin_point, proj_u, proj_vec));
                }
            }

            angle += dir * angle_step;
        }

        // involute_points.push(points[0]);
        // involute_points.push(points[points.length - 1])
        for (var a = 0; a < points.length; a++) {
                involute_points.push(points[a]);
        }

        dir = -dir;
    }

    return new MakerJs.models.ConnectTheDots(loop, involute_points);
}

var circle = new MakerJs.models.Ellipse(radius, radius);

var bezier_points = [
    [-radius, -3 * radius],
    [0, 0.0],
    [radius, -3 * radius]
];
var bezier = new MakerJs.models.BezierCurve(bezier_points);

var bezier2_points = [
    [-radius, +3 * radius],
    [0, 0.0],
    [radius, +3 * radius]
];
var bezier2 = new MakerJs.models.BezierCurve(bezier2_points);

var line_x = 1.5 * radius;
var line_points: IPoint[] = [[line_x, -radius], [line_x, 0], [line_x, radius]];
var line = new MakerJs.models.ConnectTheDots(false, line_points);

var x_axis: IPoint[] = [[-radius, 0], [0, 0], [radius, 0]];
var x_line = new MakerJs.models.ConnectTheDots(false, x_axis);


var y_axis: IPoint[] = [[0, -radius], [0, 0], [0, radius]];
var y_line = new MakerJs.models.ConnectTheDots(false, y_axis);


var model = {
    models: {
        circle: { layer: "red", ...circle },
        circle_teeth: modelToInvoluteGear(circle, spacing, radius * 0.1, true, 0.001),
        bezier: { layer: "red", ...bezier },
        bezier_teeth: modelToInvoluteGear(bezier, spacing, radius * 0.1, false, 0.001),
        bezier2: { layer: "red", ...bezier2 },
        bezier2_teeth: modelToInvoluteGear(bezier2, spacing, radius * 0.1, false, 0.001),
        line: { layer: "red", ...line },
        linier_teeth: modelToInvoluteGear(line, spacing, radius * 0.1, false, 0.001)
    }
};

var renderOptions: MakerJs.exporter.ISVGRenderOptions = {
    strokeWidth: "1mm",
    units: MakerJs.unitType.Millimeter
};

var svg = MakerJs.exporter.toSVG(model, renderOptions);

fs.writeFile("test.svg", svg, _ => { });
