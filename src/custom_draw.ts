import MakerJs, { IModel, IModelMap, IPathMap, IPoint, path, paths } from "makerjs";
import * as math from "./math";

export interface ModelContainer {
    model: IModel,
    start: IPoint,
    end: IPoint,
    length: number,
} 

export function spiralArc(center:IPoint, start_rad: number, end_rad:number, start_angle:number, end_angle:number, dir = 1, resolution = 100) : ModelContainer {

    var start = math.circlePoint(center, start_rad, start_angle);
    var end = math.circlePoint(center, end_rad, end_angle);
    var vec_start = math.circlePoint([0,0], start_rad, start_angle);
    var vec_end = math.circlePoint([0,0], end_rad, end_angle);
    var angle_diff = math.signed_dot([0,0], vec_start, vec_end);
    
    if (dir > 0 && angle_diff < 0) {
        angle_diff = (2.0 * Math.PI) + angle_diff;
    } else if (dir < 0 && angle_diff > 0) {
        angle_diff = angle_diff - (2.0 * Math.PI);
    }
    
    var angle_step = (angle_diff)/resolution;
    var radius_step = (end_rad - start_rad)/resolution;
    var points: IPoint[] = [];
    var length = 0;

    for(var i = 0; i < resolution; i++) {
        points.push(math.circlePoint(center, start_rad, start_angle));
        if (i > 0){
            length += math.dist(points[i], points[i-1]);
        }
        start_angle += angle_step;
        start_rad += radius_step;
    }
    
    return {
        model: new MakerJs.models.ConnectTheDots(false, points),
        start,
        end,
        length,
    };
}

export function unrollSpiralOntoArc(
    center_arc: IPoint,
    rad_arc: number,
    flipY: boolean,
    arc_start_angle: number,
    arc_dir: number,
    center:IPoint,
    start_rad: number,
    end_rad:number,
    start_angle:number,
    end_angle:number,
    dir = 1,
    resolution = 100): ModelContainer {
    
    // First create the spiral points
    var vec_start = math.circlePoint([0,0], start_rad, start_angle);
    var vec_end = math.circlePoint([0,0], end_rad, end_angle);
    var angle_diff = math.signed_dot([0,0], vec_start, vec_end);
    
    if (dir > 0 && angle_diff < 0) {
        angle_diff = (2.0 * Math.PI) + angle_diff;
    } else if (dir < 0 && angle_diff > 0) {
        angle_diff = angle_diff - (2.0 * Math.PI);
    }
    
    var angle_step = (angle_diff)/resolution;
    var radius_step = (end_rad - start_rad)/resolution;
    var points: IPoint[] = [];
    var length = 0;
    var last_point = math.circlePoint(center, start_rad, start_angle);
    var newPoint;

    for(var i = 0; i < resolution; i++) {
        newPoint = math.circlePoint(center, start_rad, start_angle);
        var dist = math.dist(newPoint, last_point);
        length += dist;
        last_point = newPoint;
        points.push([length,start_rad]);
        if (i > 0){
        }
        start_angle += angle_step;
        start_rad += radius_step;
    }

    // Project onto the arc
    var angle_arc = arc_start_angle;
    var new_points = [];
    var last_point = points[0];
    
    for(var i = 0; i < points.length; i++) {
        var new_point = points[i];
        var arc_circ_step = Math.abs(new_point[0] - last_point[0]);
        var arc_angle_step = arc_dir * ((arc_circ_step/rad_arc));
        angle_arc += arc_angle_step;
        var new_proj_point;
        if (flipY){
            new_proj_point = math.circlePoint(center_arc, rad_arc + new_point[1], angle_arc);
        } else {
            new_proj_point = math.circlePoint(center_arc, rad_arc - new_point[1], angle_arc);
        }
        new_points.push(new_proj_point);
        last_point = new_point;
    }

    var start = new_points[0];
    var end = new_points[new_points.length - 1];

    return {
        model: new MakerJs.models.ConnectTheDots(false, new_points),
        start,
        end,
        length,
    };
}

export function drawCycloidalGearTeeth(
    model: MakerJs.IModel,
    cycloid_rad: number,
    tooth_width: number,
    tooth_height: number,
    offset: number,
    slop: number,
    radius: number,
    cut_out: number,
    loop: boolean,
    forward: boolean,
    involute_precision: number = 100,
): ModelContainer {

    // Our cycloid for rolling
    var tooth_prec_width = tooth_width / involute_precision;
    var cycloid_step = tooth_prec_width / cycloid_rad;

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

    function getCycloidalPoint(a: IPoint, b: IPoint, d: number): IPoint {

        // We need the slope to project out
        var slope = math.slope(a, b);
        if (d > 0) {
            slope = math.rotNintyCntClock(slope);
        } else {
            slope = math.rotNintyClock(slope);
        }

        // Get the current cycloid point
        return math.applyVectorMul(b, cycloid_rad / math.magnitude(slope), slope);
    };

    var involutes = [];

    // Now we walk along the chain
    var dir = 1;

    // Projection method
    var i;
    if (!forward) {
        cut_out = -cut_out;
        i = num_points - 1 - start;
    } else {
        i = start;
    }

    var tests = [];
    var start_point: IPoint = [0,0];

    while (true) {
        
        if (!forward && i <= -start) {
            break;
        } else if (forward && i >= num_points + start) {
            break;
        }

        var n_tooth = i - dir * slop;
        var tmp_row = []

        start_point = getPoint(n_tooth);
        var prev_point = getPoint(n_tooth - dir);
        var prev_point_in = getPoint(n_tooth + dir);

        var last_new = start_point;

        var slope_measure_orig = math.slope(prev_point, prev_point_in);
        var measure_vec = math.rotNintyClock(slope_measure_orig);
        var measure_mag = 1.0/math.magnitude(measure_vec);
        measure_vec = math.applyVectorMul([0,0], measure_mag, measure_vec);

        var center_point = start_point;
        var cycloid = getCycloidalPoint(prev_point, center_point, dir);

        var center_point_in = center_point;
        var cycloid_in = getCycloidalPoint(prev_point_in, center_point_in, dir);

        // Get the initial angles
        var angle_init = math.circle_angle(cycloid, start_point);
        var angle_init_in = math.circle_angle(cycloid_in, start_point);

        // The initial cycloid
        var slope = math.slope(start_point, cycloid);
        var slope_prev = slope;

        var slope_in = math.slope(start_point, cycloid_in);
        var slope_in_prev = slope_in;

        // Loop variables
        var done = false;
        var done_in = false;
        var angle_offset = 0.0;
        var angle_offset_in = 0.0;
        var j = n_tooth;
        var j_in = n_tooth;

        // Let's walk the walk
        while (true) {
            
            // Outside bit
            if (!done){
                j += dir;
                angle_offset = angle_offset + dir * cycloid_step;
                
                prev_point = center_point;
                center_point = getPoint(j);
        
                cycloid = getCycloidalPoint(prev_point, center_point, dir);
                slope_prev = slope;
                slope = math.slope(center_point, cycloid);
                angle_offset = angle_offset + math.signed_dot([0,0], slope, slope_prev);
                var new_point = math.circlePoint(cycloid, cycloid_rad, angle_init - angle_offset);
                
                // To get a correct fillet we need to test our length against a projection of the end point
                //  that's where the fillet would end
                var new_point_slope = math.slope(last_new, new_point);
                var comp_angle = math.dot_a([0,0],new_point_slope,measure_vec);
                var height_measure = tooth_height - radius + radius * Math.sin(comp_angle);
                var new_point_measure = math.slope(start_point, new_point);
                var proj = math.project(new_point_measure, measure_vec);
                var mag_proj = math.magnitude(proj);

                done = mag_proj > height_measure;
                
                if (!done) {
                    if (forward) {
                        tmp_row.push(new_point);
                    } else {
                        tmp_row.unshift(new_point);
                    }
                }

                last_new = new_point;
            }
            
            if (!done_in) {
                j_in -= dir;
                angle_offset_in = angle_offset_in + dir * cycloid_step;
                
                prev_point_in = center_point_in;
                center_point_in = getPoint(j_in);

                cycloid_in = getCycloidalPoint(prev_point_in, center_point_in, dir);
                slope_in_prev = slope_in;
                slope_in = math.slope(center_point_in, cycloid_in);
                angle_offset_in = angle_offset_in + math.signed_dot([0,0], slope_in, slope_in_prev);
    
                var new_point_in = math.circlePoint(cycloid_in, cycloid_rad, angle_init_in - angle_offset_in);
    
                var measure_vec_b_in = math.slope(start_point, new_point_in);

                var proj_in = math.project(measure_vec_b_in, measure_vec);
                var mag_proj_in = math.magnitude(proj_in);
    
                done_in = mag_proj_in > tooth_height;
    
                if (!done_in) {
                    if (!forward) {
                        tmp_row.push(new_point_in);
                    } else {
                        tmp_row.unshift(new_point_in);
                    }
                }
            }

            if (done && done_in) {
                break;
            }
        }

        // Constructing our Radii
        var top_fillet_start = tmp_row[tmp_row.length - 1];

        var fillet_proj = math.slope(top_fillet_start, tmp_row[tmp_row.length - 2]);
        var filler_proj_center;

        if (dir > 0) {
            filler_proj_center = math.rotNintyClock(fillet_proj);
        } else {
            filler_proj_center = math.rotNintyCntClock(fillet_proj);
        }

        var fillet_proj_mag = radius/math.magnitude(fillet_proj);
        var end_mag;

        if(forward){
            end_mag = dir * radius;
        } else {
            end_mag = -dir * radius;
        }

        var top_fillet_center = math.applyVectorMul(top_fillet_start, -fillet_proj_mag, filler_proj_center);
        var top_fillet_end = math.applyVectorMul(top_fillet_center, end_mag, measure_vec);

        var start_ang_fillet = math.circle_angle(top_fillet_center, top_fillet_start);
        var angle_diff = dir * math.dot_a(top_fillet_center, top_fillet_start, top_fillet_end)/20;

        for(var j = 0; j < 20; j++) {
            start_ang_fillet -= angle_diff;
            var fillet_point = math.circlePoint(top_fillet_center, radius, start_ang_fillet);
            tmp_row.push(fillet_point);
        }

        // Constructing our cutout
        var cutout_point = math.applyVectorMul(tmp_row[0], -dir * cut_out, measure_vec);
        tests.push(cutout_point);
        tmp_row.unshift(cutout_point);

        if (dir > 0) {
            for (var j = 0; j < tmp_row.length; j++) {
                involutes.push(tmp_row[j]);
            }
        } else {
            for (var j = tmp_row.length - 1; j >= 0; j--) {
                involutes.push(tmp_row[j]);
            }
        }

        if (!forward) {
            i -= involute_precision;
        } else {
            i += involute_precision;
        }
        
        dir = -dir;
    }

    return {
        model: new MakerJs.models.ConnectTheDots(loop, involutes),
        start: involutes[0],
        end: involutes[involutes.length - 1],
        length: chain.pathLength,
    };
}
