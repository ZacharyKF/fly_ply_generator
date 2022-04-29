import { Bezier, Point } from "bezier-js";
import { IPoint, models } from "makerjs";
import { acos, exp, max, min, sqrt, sum } from "mathjs";
import { point_dist } from "./makerjs_tools";

export function pythag_h_a(h: number, a: number) : number {
    return sqrt(h * h - a * a);
}

export function pythag_a_b(a: number, b: number) : number {
    return sqrt(a * a + b * b);
}

// Adapted from https://stackoverflow.com/questions/4103405/what-is-the-algorithm-for-finding-the-center-of-a-circle-from-three-points
export function circleFromThreePoints(a : IPoint, b : IPoint, c : IPoint) : IPoint {
    var ax = (a[0] + b[0]) / 2.0;
    var ay = (a[1] + b[1]) / 2.0;
    var ux = (a[1] - b[1]);
    var uy = (b[0] - a[0]);
    var bx = (b[0] + c[0]) / 2.0;
    var by = (b[1] + c[1]) / 2.0;
    var vx = (b[1] - c[1]);
    var vy = (c[0] - b[0]);
    var dx = ax - bx;
    var dy = ay - by;
    var vu = vx * uy - vy * ux;

    // Circle is at infinity, so just return a center that's really far away
    if (vu == 0.0){
        var point_slope = rotNintyClock(slope(a, c));
        return applyVectorMul(a, 100000000000, point_slope);
    }

    var g = (dx * uy - dy * ux) / vu;
    return [bx + g * vx, by + g * vy];
}

export function dot(center: IPoint, a: IPoint, b :IPoint): number {
    var vec_a = [a[0] - center[0], a[1] - center[1]];
    var vec_b = [b[0] - center[0], b[1] - center[1]];
    return (vec_a[0] * vec_b[0] + vec_a[1] * vec_b[1])/(magnitude(vec_a) * magnitude(vec_b));
}

export function dot_a(center: IPoint, a: IPoint, b :IPoint): number {
    return Math.acos(dot(center, a, b));
}

export function point_dot(center: Point, a: Point, b :Point): number {
    let vec_a: Point = {
        x: a.x - center.x,
        y: a.y - center.y,
    };
    let vec_b: Point = {
        x: b.x - center.x,
        y: b.y - center.y,
    };
    let sum = vec_a.x * vec_b.x + vec_a.y * vec_b.y;
    if (a.z != undefined && b.z != undefined && center.z != undefined) {
        vec_a.z = a.z - center.z;
        vec_b.z = b.z - center.z;
        sum += vec_a.z * vec_b.z;
    }
    
    return sum/(point_magnitude(vec_a) * point_magnitude(vec_b));
}

export function point_dot_a(center: Point, a: Point, b :Point): number {
    return Math.acos(point_dot(center, a, b));
}

export function circle_angle(center: IPoint, a: IPoint): number{ 
    return Math.atan2(a[1] - center[1], a[0] - center[0]);
}

export function circle_angle_bezierjs(center: Point, a: Point): number{ 
    return Math.atan2(a.y - center.y, a.x - center.x);
}

export function magnitude(a: IPoint) : number {
    return Math.sqrt(Math.pow(a[0], 2) + Math.pow(a[1], 2));
}

export function point_magnitude(a: Point) : number {
    let sum = a.x * a.x + a.y * a.y;
    if (a.z != undefined) {
        sum += a.z * a.z;
    }
    return Math.sqrt(sum);
}

export function scale_point(a: Point, s: number) : Point {
    let x = a.x * s;
    let y = a.y * s;
    if (a.z != undefined) {
        let z = a.z * s;
        return {x,y,z}
    }
    return {x,y}
}

export function as_unit(a: Point): Point {
    let mag = point_magnitude(a);
    return scale_point(a, 1.0/mag);
}

export function signed_dot(center: IPoint, a: IPoint, b :IPoint): number {
    return Math.atan2(center[1] - b[1],center[0] - b[0]) - Math.atan2(center[1] - a[1],center[0] - a[0]);
}

export function point_signed_dot(center: Point, a: Point, b :Point): number {
    return Math.atan2(center.y - b.y,center.x - b.x) - Math.atan2(center.y - a.y,center.x - a.x);
}

// From https://stackoverflow.com/questions/2150050/finding-signed-angle-between-vectors
export function rotationDir(center: IPoint, a: IPoint, b :IPoint) : number {
    return Math.sign(signed_dot(center, a, b));
}

export function rotation_dir(center: Point, a: Point, b :Point) : number {
    return Math.sign(point_signed_dot(center, a, b));
}

export function dist(a: IPoint, b: IPoint): number {
    return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
}

export function slope(a: IPoint, b: IPoint): IPoint {
    return [b[0] - a[0] , b[1] - a[1]];
}

export function applyVectorMul(a:IPoint, b:number, c:IPoint) : IPoint {
    return [a[0] - (b * c[0]), a[1] - (b * c[1])];
}

export function apply_vector_mul(a:Point, b:number, c:Point) : Point {
    return {
        x: a.x + (b * c.x),
        y: a.y + (b * c.y)
    };
}

export function rotNintyClock(a:IPoint):IPoint {
    return [-a[1], a[0]];
}

export function rotNintyCntClock(a:IPoint):IPoint {
    return [a[1], -a[0]];
}

export function rot_point_ninty_clock(a:Point):Point {
    return {
        x: -a.y,
        y: a.x
    };
}

export function rot_point_ninty_cnt_clock(a:Point):Point {
    return {
        x: a.y, 
        y:-a.x
    };
}

export function circlePoint(center: IPoint, radius: number, angle: number): IPoint {
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)];
}

export function circle_point_bezierjs(center: Point, radius: number, angle: number): Point {
    return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
    };
}

export function project(a: IPoint, b: IPoint): IPoint {
    var mag_b = magnitude(b);
    var proj = (a[0] * b[0] + a[1] * b[1])/ (mag_b * mag_b);
    return [proj * b[0], proj * b[1]];
}


export function bezier_length(bezier: Bezier, t1: number, t2: number): number {
    if (!bezier._3d){
        return bezier.split(t1, t2).length();
    }
    
    let t_max = max(t1, t2);
    let t_min = min(t1, t2);
    let dist = 0;
    let t_step = (t_max - t_min)/1000;
    let prev_point = bezier.get(t_min);
    for(let i = t_min + t_step; i <= t_max; i += t_step){
        let new_point = bezier.get(i);
        dist = dist + point_dist(prev_point, new_point);
        prev_point = new_point;
    }
    return dist;
}