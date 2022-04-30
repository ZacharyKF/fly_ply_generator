import { Bezier, Point } from "bezier-js";
import { IPoint, models } from "makerjs";
import math, { acos, exp, floor, MathArray, Matrix, max, min, number, sqrt, sum, matrix, inv, multiply, transpose } from "mathjs";
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

export function average_point(a: Point, b: Point): Point {
    let x = (a.x + b.x)/2;
    let y = (a.y + b.y)/2;
    if (a.z != undefined && b.z != undefined) {
        let z = (a.z + b.z)/2;
        return {x, y, z}
    }
    return {x, y}
}

export function bezier_points_to_control_order(points: Point[], order: number): Point[] {
    let bezier_points = bezier_controls_from_line_points(points);
    while(bezier_points.length - 2 > order) {
        bezier_points = reduce_bezier_control_order(bezier_points);
    }
    return bezier_points;
}

// Many thanks to https://pomax.github.io/bezierinfo/#curvefitting
export function bezier_controls_from_line_points(points: Point[]) : Point[] {
    
    let controls: Point[] = [];

    // This is just a straight-ish line so slap the midpoint in the middle
    if (points.length == 2 || points.length > 4) {
        let temp = points.pop();
        if (temp != undefined) {
            controls.push(points[0]);
            controls.push(average_point(points[0], temp));
            controls.push(temp);
        }
        return controls;
    }

    let t_values = calculate_t_vals(points);
    let { T, Tt } = formTMatrix(t_values);
    
    // Constructing M Matrix
    let m_data: number[][] = [];
    let k = points.length - 1;
    for ( let i = 0; i < points.length; i++) {
        m_data.push(points.map(v => 0));
        m_data[i][i] = binomial(k, i);
    }
    
    for ( let c = 0, r; c < points.length; c++) {
        for (r = c + 1; r < points.length; r++) {
            let sign = (r + c) % 2 == 0 ? 1 : -1;
            m_data[r][c] = sign * binomial(r, c) * m_data[r][r]; 
        }
    }

    // console.log("-------")
    // m_data.map(row => row.join(", ")).forEach(val => console.log(val))
    
    let m: Matrix = matrix(m_data);
    let m_invert: Matrix = inv(m);
    
    // Getting to the good stuff
    let t_trans_mul_t_inverse = inv(multiply(Tt, T));
    let step_1 = multiply(t_trans_mul_t_inverse, Tt);
    let step_2 = multiply(m_invert, step_1);
    let x_big: Matrix = matrix(points.map(v => [v.x]))
    let cx: Matrix = multiply(step_2, x_big); 
    let x: number[][] = <number[][]>cx.toArray();

    let y_big: Matrix = matrix(points.map(val => [val.y]));
    let cy = multiply(step_2, y_big);
    let y: number[][] = <number[][]>cy.toArray();

    let bezier_points = x.map((row, idx) => {
        return {
            x: row[0],
            y: y[idx][0],
        }
    });

    // bezier_points.forEach(p => console.log(p))

    // Re-adjust the start and end to prevent drift
    bezier_points[0] = points[0];
    bezier_points[bezier_points.length - 1] = points[points.length -1];

    return bezier_points;
}

function calculate_t_vals(datum: Point[]): number[] {
    const D = [0];
    for(let i = 1; i< datum.length; i++) {
        let dist = point_dist(datum[0], datum[1]);
        D.push(dist + D[D.length - 1]);
    }
    let len = D[D.length - 1];
    let S = D.map(val => val/len);
    S[S.length - 1] = 1.0;
    return S;
}

function formTMatrix(row: number[]): {
    T: Matrix,
    Tt: Matrix,
} {
    // it's actually easier to create the transposed
    // version, and then (un)transpose that to get T!
    let data = [];
    for (var i = 0; i < row.length; i++) {
      data.push(row.map((v) => v ** i));
    }
    const Tt = matrix(data);
    const T = transpose(Tt);
    return { T, Tt };
}

// Shamelessly taken from https://github.com/Pomax/BezierInfo-2/blob/aea1304d6ff9e3fcebcbca4f2dc219289df40195/docs/js/graphics-element/api/util/binomial.js
var binomialCoefficients = [[1], [1, 1]];

/**
 * ... docs go here ...
 */
export function binomial(n: number, k: number): number {
  if (n === 0) return 1;
  var lut = binomialCoefficients;
  while (n >= lut.length) {
    var s = lut.length;
    var nextRow = [1];
    for (var i = 1, prev = s - 1; i < s; i++) {
      nextRow[i] = lut[prev][i - 1] + lut[prev][i];
    }
    nextRow[s] = 1;
    lut.push(nextRow);
  }
  return lut[n][k];
}


export function reduce_bezier_control_order(controls: Point[]) : Point[] {
    if (controls.length <= 4) {
        return controls;
    }

    let new_controls: Point[] = [];
    new_controls.push(controls[0]);
    new_controls.push(controls[1]);
    new_controls.push(controls[controls.length -2]);
    new_controls.push(controls[controls.length -1]);

    return new_controls;
}