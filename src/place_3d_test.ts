import MakerJs, { IModel, IModelMap } from "makerjs";
import { abs, cbrt, cos, pi, sqrt } from "mathjs";
import { Point2D, Point3D } from "./euclidean/rational_point";
import { export_svg, make_arrow } from "./utils/makerjs_tools";
import { flat_third_from_3D } from "./utils/rational_math";

const draw_arrow = (a: Point2D, b: Point2D, l: number): IModel => {
    return make_arrow(0, a, b, (l * pi) / 16, 0.25);
};

const tri = sqrt(1 / 3);

const a = Point3D.Zero;
const b = new Point3D(0, 1, 1, 1);
const c = new Point3D(tri, tri, tri, 1);

const all_3d = [a, b, c];
const proj_3d = all_3d.map((p) => new Point2D(p.x, p.z, 1));

const models: IModelMap = {};

const proj_ab = draw_arrow(proj_3d[0], proj_3d[1], 1);
const proj_ac = draw_arrow(proj_3d[0], proj_3d[2], 1);

const a_2d = Point2D.Zero;
const b_2d = Point2D.Y.mul(b.dist(a));

const orig_points_2d = new MakerJs.models.Holes(
    0.0625,
    [a_2d, b_2d].map((p) => p.to_ipoint(0))
);

const ab_2d = b_2d.sub(a_2d);
const perp_ab_2d_clk = ab_2d.rotate_clockwise();
const perp_ab_2d_cnt = ab_2d.rotate_counterclockwise();
const basis = [ab_2d, perp_ab_2d_clk, perp_ab_2d_cnt];

const vec_ac = c.sub(a);
const vec_ab = b.sub(a);
const dot_bac = vec_ab.dot(vec_ac);
const a_bac = vec_ab.angle(vec_ac);
const cross_mag_bac = vec_ab.cross_mag(vec_ac);
const mag_ac = vec_ac.magnitude();

const tau = pi/2;
const find_orig = (
    k: Point2D,
    a: number,
    m: number
): {
    test_a: Point2D;
    test_b: Point2D;
} => {
    const k_u = k.as_unit();
    const k_u_clk = k_u.rotate_clockwise();
    const a_n = a + pi / 2;
    const b_n = a - pi / 2;
    const cos_a = cos(a);
    const cos_an = cos(a_n);
    const cos_bn = cos(b_n);
    return {
        test_a: new Point2D(
            m * (k_u.x * cos_a + k_u_clk.x * cos_an),
            m * (k_u.y * cos_a + k_u_clk.y * cos_an),
            k.w
        ),
        test_b: new Point2D(
            m * (k_u.x * cos_a + k_u_clk.x * cos_bn),
            m * (k_u.y * cos_a + k_u_clk.y * cos_bn),
            k.w
        ),
    };
};

const {test_a, test_b} = find_orig(ab_2d, a_bac, mag_ac);
const test_c = flat_third_from_3D(a, a_2d, b, b_2d, c, Point2D.X);



const test_dot = test_a.dot(ab_2d);
const test_cross = test_a.cross_mag(ab_2d);

console.log("TEST MAG - ORIG MAG: ", test_a.magnitude() - mag_ac);
console.log("TEST DOT - ORIG DOT: ", test_dot - dot_bac);
console.log("TEST CROSS - ORIG CROSS: ", abs(test_cross) - abs(cross_mag_bac));
console.log("TEST C ERROR: ", test_c.x - test_b.x, test_c.y - test_b.y);

const ar_a = { layer: "green", ...draw_arrow(Point2D.Zero, test_a, 2) };
const ar_b = { layer: "green", ...draw_arrow(Point2D.Zero, test_b, 2) };

models["prab"] = { layer: "red", ...proj_ab };
models["prac"] = { layer: "red", ...proj_ac };
models["orig"] = orig_points_2d;
basis
    .map((v) => ({ layer: "blue", ...draw_arrow(Point2D.Zero, v, 3) }))
    .forEach((v, i) => {
        models["basis_" + i] = v;
    });
models["ar_a"] = ar_a;
models["ar_b"] = ar_b;

export_svg("new_proj_test", { models });
